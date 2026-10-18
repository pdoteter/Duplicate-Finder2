const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dbService = require('./db');

let isScanCancelled = false;
const waitingWorkers = [];
const waitingProducers = [];

function wakeAllWaiting() {
  while (waitingWorkers.length > 0) {
    const resolve = waitingWorkers.shift();
    if (resolve) resolve();
  }
  while (waitingProducers.length > 0) {
    const resolve = waitingProducers.shift();
    if (resolve) resolve();
  }
}

// Compute quick hash: first 64KB + last 64KB for large files, or full hash for <= 128KB
async function computeQuickHash(filePath, fileSize) {
  if (fileSize === 0) {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // hash of empty file
  }

  const SAMPLE_SIZE = 64 * 1024; // 64 KB
  const hash = crypto.createHash('sha256');

  if (fileSize <= SAMPLE_SIZE * 2) {
    try {
      const buf = await fs.promises.readFile(filePath);
      hash.update(buf);
      return hash.digest('hex');
    } catch (err) {
      return null;
    }
  }

  // Large file: read first 64KB and last 64KB
  let fd;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const headBuf = Buffer.allocUnsafe(SAMPLE_SIZE);
    const { bytesRead: headBytes } = await fd.read(headBuf, 0, SAMPLE_SIZE, 0);
    hash.update(headBuf.subarray(0, headBytes));

    const tailBuf = Buffer.allocUnsafe(SAMPLE_SIZE);
    const tailPosition = Math.max(0, fileSize - SAMPLE_SIZE);
    const { bytesRead: tailBytes } = await fd.read(tailBuf, 0, SAMPLE_SIZE, tailPosition);
    hash.update(tailBuf.subarray(0, tailBytes));

    return hash.digest('hex');
  } catch (err) {
    return null;
  } finally {
    if (fd) {
      try { await fd.close(); } catch (_) {}
    }
  }
}

// Compute full SHA-256 for a file
async function computeFullHash(filePath) {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(null));
    } catch (err) {
      resolve(null);
    }
  });
}

function cancelScan() {
  isScanCancelled = true;
  wakeAllWaiting();
}

/**
 * Scan a location directory recursively using concurrent access threads and store entries in SQLite.
 * Supports resume mode to continue from where an interrupted scan left off.
 * @param {number} locationId 
 * @param {string} rootPath 
 * @param {Function} onProgress 
 * @param {boolean} computeHashesNow 
 * @param {number} concurrency Number of concurrent threads accessing files (default: 4)
 * @param {string} scanMode 'resume' | 'fresh' (default: 'resume')
 */
async function scanLocation(locationId, rootPath, onProgress = () => {}, computeHashesNow = true, concurrency = 4, scanMode = 'resume') {
  isScanCancelled = false;
  waitingWorkers.length = 0;
  waitingProducers.length = 0;

  const normalizedRoot = path.normalize(rootPath);

  if (!fs.existsSync(normalizedRoot)) {
    throw new Error(`Directory does not exist: ${normalizedRoot}`);
  }

  // Handle Scan Mode (Fresh Rescan vs Resume)
  const customQuarantineSetting = (dbService.getSetting('quarantine_folder_name', '_duplicates_trash') || '').toLowerCase().trim();
  const excludedExtensions = new Set(dbService.getExcludedExtensions());
  const existingFilesSet = new Set();
  let totalFiles = 0;
  let totalBytes = 0;
  let skippedExistingFiles = 0;

  if (scanMode === 'fresh') {
    // Clear previous entries for this location
    dbService.execute('DELETE FROM files WHERE location_id = ?', [locationId]);
  } else {
    // Resume mode: load existing indexed files from SQLite cache
    const existingRows = dbService.queryAll(
      'SELECT relative_path, file_size FROM files WHERE location_id = ?',
      [locationId]
    );
    for (const row of existingRows) {
      existingFilesSet.add(row.relative_path);
      totalBytes += (row.file_size || 0);
    }
    totalFiles = existingRows.length;
  }

  // Mark location as scanning in DB
  dbService.execute('UPDATE locations SET scan_status = ? WHERE id = ?', ['in_progress', locationId]);

  let batch = [];
  const BATCH_SIZE = 250;
  let newlyIndexedCount = 0;
  let lastProgressTime = Date.now();
  let lastDiskSaveTime = Date.now();
  let currentTraversingDir = '';
  let lastProcessedFileName = '';

  function flushBatch() {
    if (batch.length === 0) return;
    const itemsToInsert = batch;
    batch = [];

    const db = dbService.getDb();
    db.run('BEGIN TRANSACTION;');
    const stmt = db.prepare(`
      INSERT INTO files (location_id, relative_path, file_name, file_extension, file_size, mtime, quick_hash, full_hash, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const nowIso = new Date().toISOString();
    for (const item of itemsToInsert) {
      stmt.run([
        locationId,
        item.relativePath,
        item.fileName,
        item.fileExt,
        item.fileSize,
        item.mtime,
        item.quickHash,
        item.fullHash,
        nowIso
      ]);
    }
    stmt.free();
    db.run('COMMIT;');
  }

  const dirQueue = [''];
  const fileQueue = [];
  const MAX_FILE_QUEUE = 2000;
  let traversalComplete = false;

  function waitForFile() {
    return new Promise((resolve) => {
      waitingWorkers.push(resolve);
    });
  }

  function notifyFileAvailable() {
    const resolve = waitingWorkers.shift();
    if (resolve) resolve();
  }

  function waitForQueueDrain() {
    return new Promise((resolve) => {
      waitingProducers.push(resolve);
    });
  }

  function notifyQueueDrained() {
    if (fileQueue.length < MAX_FILE_QUEUE / 2) {
      while (waitingProducers.length > 0) {
        const resolve = waitingProducers.shift();
        if (resolve) resolve();
      }
    }
  }

  // Producer: Traverses directories and feeds fileQueue
  async function traverseDirectories() {
    while (dirQueue.length > 0 && !isScanCancelled) {
      // Backpressure to prevent excessive memory usage on huge shares
      if (fileQueue.length >= MAX_FILE_QUEUE) {
        await waitForQueueDrain();
        if (isScanCancelled) break;
      }

      const currentRelDir = dirQueue.shift();
      currentTraversingDir = currentRelDir || '/';
      const currentFullDir = path.join(normalizedRoot, currentRelDir);

      let entries;
      try {
        entries = await fs.promises.readdir(currentFullDir, { withFileTypes: true });
      } catch (err) {
        // Permission denied or unreadable directory on network share, skip
        continue;
      }

      for (const entry of entries) {
        if (isScanCancelled) break;

        const relPath = currentRelDir ? path.join(currentRelDir, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // Skip system & quarantine directories common on network shares ($RECYCLE.BIN, System Volume Information, .Trash, _duplicates_trash, etc.)
          const lowerName = entry.name.toLowerCase();
          if (
            lowerName === '$recycle.bin' ||
            lowerName === 'system volume information' ||
            lowerName === '.trashes' ||
            lowerName === '_duplicates_trash' ||
            lowerName === '.duplicates_trash' ||
            lowerName.startsWith('_duplicates_') ||
            (customQuarantineSetting && lowerName === customQuarantineSetting)
          ) {
            continue;
          }
          dirQueue.push(relPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '');
          const lowerFileName = entry.name.toLowerCase();
          if (excludedExtensions.has(ext) || excludedExtensions.has(lowerFileName)) {
            continue;
          }

          const normalizedRelPath = relPath.replace(/\\/g, '/');

          // If resuming and this file is already indexed, skip it immediately!
          if (scanMode === 'resume' && existingFilesSet.has(normalizedRelPath)) {
            skippedExistingFiles++;
            const now = Date.now();
            if (now - lastProgressTime > 150) {
              lastProgressTime = now;
              onProgress({
                locationId,
                totalFiles,
                totalBytes,
                currentDir: currentTraversingDir,
                currentFile: entry.name,
                activeThreads: concurrency,
                resumed: true,
                skippedExisting: skippedExistingFiles
              });
            }
            continue;
          }

          fileQueue.push({
            fullFilePath: path.join(normalizedRoot, relPath),
            relPath,
            fileName: entry.name,
            normalizedRelPath
          });
          notifyFileAvailable();
        }
      }
    }

    traversalComplete = true;
    wakeAllWaiting();
  }

  // Consumer: Concurrent access worker (runs up to `concurrency` parallel tasks)
  async function workerLoop() {
    while (!isScanCancelled) {
      if (fileQueue.length === 0) {
        if (traversalComplete) {
          break; // All files processed
        }
        await waitForFile();
        continue;
      }

      const task = fileQueue.shift();
      notifyQueueDrained();

      if (!task) continue;

      let stat;
      try {
        stat = await fs.promises.stat(task.fullFilePath);
      } catch (err) {
        continue;
      }

      totalFiles++;
      totalBytes += stat.size;
      newlyIndexedCount++;
      lastProcessedFileName = task.fileName;

      let quickHash = null;
      if (computeHashesNow) {
        quickHash = await computeQuickHash(task.fullFilePath, stat.size);
      }

      const ext = path.extname(task.fileName).toLowerCase().replace('.', '');

      batch.push({
        relativePath: task.normalizedRelPath,
        fileName: task.fileName,
        fileExt: ext,
        fileSize: stat.size,
        mtime: Math.floor(stat.mtimeMs),
        quickHash,
        fullHash: null
      });

      if (batch.length >= BATCH_SIZE) {
        flushBatch();

        // Periodic disk save every 2500 files or 30s to protect large scans
        const now = Date.now();
        if (newlyIndexedCount % 2500 === 0 || (now - lastDiskSaveTime > 30000 && newlyIndexedCount > 0)) {
          lastDiskSaveTime = now;
          dbService.saveDatabase();
        }
      }

      const now = Date.now();
      if (now - lastProgressTime > 150) {
        lastProgressTime = now;
        onProgress({
          locationId,
          totalFiles,
          totalBytes,
          currentDir: currentTraversingDir,
          currentFile: lastProcessedFileName,
          activeThreads: concurrency,
          resumed: scanMode === 'resume',
          skippedExisting: skippedExistingFiles
        });
      }
    }

    wakeAllWaiting();
  }

  // Launch traversal and concurrency worker threads
  const traversalPromise = traverseDirectories();
  const workerCount = Math.max(1, concurrency || 4);
  const workerPromises = [];
  for (let i = 0; i < workerCount; i++) {
    workerPromises.push(workerLoop());
  }

  await Promise.all([traversalPromise, ...workerPromises]);
  flushBatch();

  // Query actual final stats from SQLite for guaranteed accuracy
  const finalDbStats = dbService.queryOne(
    'SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size FROM files WHERE location_id = ?',
    [locationId]
  ) || { count: totalFiles, size: totalBytes };

  const finalStatus = isScanCancelled ? 'cancelled' : 'completed';

  // Update location record in DB
  dbService.execute(`
    UPDATE locations 
    SET last_scanned_at = ?, total_files = ?, total_size = ?, scan_status = ?
    WHERE id = ?
  `, [new Date().toISOString(), finalDbStats.count, finalDbStats.size, finalStatus, locationId]);

  dbService.saveDatabase();

  onProgress({
    locationId,
    totalFiles: finalDbStats.count,
    totalBytes: finalDbStats.size,
    completed: true,
    cancelled: isScanCancelled,
    scanStatus: finalStatus,
    activeThreads: concurrency,
    resumed: scanMode === 'resume',
    skippedExisting: skippedExistingFiles
  });

  return {
    cancelled: isScanCancelled,
    totalFiles: finalDbStats.count,
    totalBytes: finalDbStats.size,
    scanStatus: finalStatus,
    skippedExisting: skippedExistingFiles
  };
}

/**
 * Scan multiple locations in sequence using concurrent access threads.
 * @param {number[]} locationIds 
 * @param {Function} onProgress 
 * @param {boolean} computeHashesNow 
 * @param {number} concurrency Number of concurrent threads accessing files (default: 4)
 * @param {string} scanMode 'resume' | 'fresh' (default: 'resume')
 */
async function scanMultipleLocations(locationIds, onProgress = () => {}, computeHashesNow = true, concurrency = 4, scanMode = 'resume') {
  isScanCancelled = false;
  const results = [];

  for (let i = 0; i < locationIds.length; i++) {
    if (isScanCancelled) break;
    const locId = locationIds[i];
    const loc = dbService.queryOne('SELECT * FROM locations WHERE id = ?', [locId]);
    if (!loc) continue;

    onProgress({
      multiScan: true,
      currentIndex: i,
      totalLocations: locationIds.length,
      currentLocationLabel: loc.label || loc.path,
      locationId: locId,
      totalFiles: 0,
      totalBytes: 0,
      currentDir: 'Starting...',
      activeThreads: concurrency,
      scanMode
    });

    const res = await scanLocation(
      locId,
      loc.path,
      (prog) => {
        onProgress({
          ...prog,
          multiScan: true,
          currentIndex: i,
          totalLocations: locationIds.length,
          currentLocationLabel: loc.label || loc.path,
          activeThreads: concurrency,
          scanMode
        });
      },
      computeHashesNow,
      concurrency,
      scanMode
    );
    results.push({ locationId: locId, ...res });
  }

  onProgress({
    multiScan: true,
    completed: true,
    cancelled: isScanCancelled,
    results,
    activeThreads: concurrency
  });

  return results;
}

module.exports = {
  scanLocation,
  scanMultipleLocations,
  cancelScan,
  computeQuickHash,
  computeFullHash
};
