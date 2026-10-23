const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL = null;
let db = null;
let dbFilePath = null;
let saveTimeout = null;

const LOCATION_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#f97316'  // Orange
];

async function initDatabase(storageDir) {
  if (db) return db;
  
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  dbFilePath = path.join(storageDir, 'backup_comparator.db');

  SQL = await initSqlJs();

  if (fs.existsSync(dbFilePath)) {
    try {
      const fileBuffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Failed to load existing database file, creating a fresh one:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Run schema creation
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'share',
      label TEXT,
      is_active INTEGER DEFAULT 1,
      color TEXT DEFAULT '#6366f1',
      last_scanned_at TEXT,
      total_files INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      scan_status TEXT DEFAULT 'not_scanned'
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_extension TEXT,
      file_size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      quick_hash TEXT,
      full_hash TEXT,
      scanned_at TEXT,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ignored_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_location_id INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      ignored_at TEXT NOT NULL,
      reason TEXT,
      FOREIGN KEY (backup_location_id) REFERENCES locations(id) ON DELETE CASCADE,
      UNIQUE(backup_location_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS ignored_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_size INTEGER NOT NULL,
      quick_hash TEXT NOT NULL,
      file_name TEXT,
      ignored_at TEXT NOT NULL,
      UNIQUE(file_size, quick_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_files_loc ON files(location_id);
    CREATE INDEX IF NOT EXISTS idx_files_relpath ON files(location_id, relative_path);
    CREATE INDEX IF NOT EXISTS idx_files_size ON files(file_size);
    CREATE INDEX IF NOT EXISTS idx_files_quickhash ON files(quick_hash);
    CREATE INDEX IF NOT EXISTS idx_files_fullhash ON files(full_hash);
    CREATE INDEX IF NOT EXISTS idx_files_size_hash ON files(file_size, quick_hash);
    CREATE INDEX IF NOT EXISTS idx_files_ext ON files(file_extension);
    CREATE INDEX IF NOT EXISTS idx_ignored_sets_key ON ignored_sets(file_size, quick_hash);

    CREATE TABLE IF NOT EXISTS ignored_directories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER,
      directory_path TEXT NOT NULL,
      ignored_at TEXT NOT NULL,
      sets_count INTEGER DEFAULT 0,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      UNIQUE(location_id, directory_path)
    );
    CREATE INDEX IF NOT EXISTS idx_ignored_dirs ON ignored_directories(location_id, directory_path);
  `);

  // Safe migrations for existing databases
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS ignored_directories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER,
        directory_path TEXT NOT NULL,
        ignored_at TEXT NOT NULL,
        sets_count INTEGER DEFAULT 0,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
        UNIQUE(location_id, directory_path)
      );
    `);
  } catch (_) {}
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_ignored_dirs ON ignored_directories(location_id, directory_path);");
  } catch (_) {}
  try {
    db.run("ALTER TABLE locations ADD COLUMN is_active INTEGER DEFAULT 1;");
  } catch (_) {}
  try {
    db.run("ALTER TABLE locations ADD COLUMN color TEXT DEFAULT '#6366f1';");
  } catch (_) {}
  try {
    db.run("ALTER TABLE locations ADD COLUMN scan_status TEXT DEFAULT 'not_scanned';");
  } catch (_) {}

  // Ensure default excluded extensions (.xmp) exist and clean existing database records
  const currentExcluded = getExcludedExtensions();
  cleanExcludedFilesFromDb(currentExcluded);

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (!db || !dbFilePath) return;
  try {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

function closeDatabase() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

function scheduleSave(delay = 1000) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveDatabase();
  }, delay);
}

// Helpers for prepared statements
function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  if (!db) return;
  if (params && params.length > 0) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

// Location management
function upsertLocation(locPath, label = null, role = 'share') {
  const normalized = path.normalize(locPath);
  const existing = queryOne('SELECT * FROM locations WHERE path = ?', [normalized]);
  const defaultLabel = label || path.basename(normalized) || normalized;

  if (existing) {
    execute('UPDATE locations SET label = COALESCE(?, label), role = ? WHERE id = ?', [defaultLabel, role, existing.id]);
    scheduleSave();
    return queryOne('SELECT * FROM locations WHERE id = ?', [existing.id]);
  } else {
    const existingCount = queryOne('SELECT COUNT(*) as count FROM locations');
    const colorIndex = (existingCount ? existingCount.count : 0) % LOCATION_COLORS.length;
    const color = LOCATION_COLORS[colorIndex];

    execute(
      'INSERT INTO locations (path, role, label, is_active, color) VALUES (?, ?, ?, 1, ?)',
      [normalized, role, defaultLabel, color]
    );
    scheduleSave();
    return queryOne('SELECT * FROM locations WHERE path = ?', [normalized]);
  }
}

function updateLocation(locationId, updates = {}) {
  const fields = [];
  const values = [];

  if (updates.label !== undefined) {
    fields.push('label = ?');
    values.push(updates.label);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }
  if (updates.scan_status !== undefined) {
    fields.push('scan_status = ?');
    values.push(updates.scan_status);
  }

  if (fields.length > 0) {
    values.push(locationId);
    execute(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`, values);
    scheduleSave();
  }

  return queryOne('SELECT * FROM locations WHERE id = ?', [locationId]);
}

function getLocationScanInfo(locationId) {
  const loc = queryOne('SELECT * FROM locations WHERE id = ?', [locationId]);
  if (!loc) return null;
  const stats = queryOne('SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size FROM files WHERE location_id = ?', [locationId]);
  const indexedCount = stats ? stats.count : 0;
  const indexedSize = stats ? stats.size : 0;
  return {
    ...loc,
    indexedFilesCount: indexedCount,
    indexedFilesSize: indexedSize,
    hasExistingFiles: indexedCount > 0,
    isResumable: indexedCount > 0 && loc.scan_status !== 'completed'
  };
}

function getLocations() {
  return queryAll('SELECT * FROM locations ORDER BY id ASC');
}

function removeLocation(locationId) {
  execute('DELETE FROM files WHERE location_id = ?', [locationId]);
  execute('DELETE FROM ignored_files WHERE backup_location_id = ?', [locationId]);
  execute('DELETE FROM ignored_directories WHERE location_id = ?', [locationId]);
  execute('DELETE FROM locations WHERE id = ?', [locationId]);
  scheduleSave();
}

function removeFile(fileId) {
  const file = queryOne('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) return null;

  execute('DELETE FROM files WHERE id = ?', [fileId]);
  execute(
    'UPDATE locations SET total_files = MAX(0, total_files - 1), total_size = MAX(0, total_size - ?) WHERE id = ?',
    [file.file_size, file.location_id]
  );
  scheduleSave();
  return file;
}

function removeFiles(fileIds = []) {
  if (!fileIds || fileIds.length === 0) return [];
  const removed = [];
  for (const id of fileIds) {
    const file = removeFile(id);
    if (file) removed.push(file);
  }
  return removed;
}

// Ignored files tracking
function ignoreFile(backupLocationId, relativePath, reason = null) {
  const normalizedRelPath = relativePath.replace(/\\/g, '/');
  execute(
    'INSERT OR REPLACE INTO ignored_files (backup_location_id, relative_path, ignored_at, reason) VALUES (?, ?, ?, ?)',
    [backupLocationId, normalizedRelPath, new Date().toISOString(), reason]
  );
  scheduleSave();
  return true;
}

function unignoreFile(backupLocationId, relativePath) {
  const normalizedRelPath = relativePath.replace(/\\/g, '/');
  execute(
    'DELETE FROM ignored_files WHERE backup_location_id = ? AND relative_path = ?',
    [backupLocationId, normalizedRelPath]
  );
  scheduleSave();
  return true;
}

function getIgnoredFiles(backupLocationId) {
  return queryAll(
    'SELECT relative_path, ignored_at, reason FROM ignored_files WHERE backup_location_id = ? ORDER BY ignored_at DESC',
    [backupLocationId]
  );
}

// Ignored duplicate sets tracking
function ignoreSet(fileSize, quickHash, fileName = null) {
  if (fileSize === undefined || fileSize === null || !quickHash) return false;
  execute(
    'INSERT OR REPLACE INTO ignored_sets (file_size, quick_hash, file_name, ignored_at) VALUES (?, ?, ?, ?)',
    [Number(fileSize), String(quickHash), fileName ? String(fileName) : null, new Date().toISOString()]
  );
  scheduleSave();
  return true;
}

function unignoreSet(fileSize, quickHash) {
  if (fileSize === undefined || fileSize === null || !quickHash) return false;
  execute(
    'DELETE FROM ignored_sets WHERE file_size = ? AND quick_hash = ?',
    [Number(fileSize), String(quickHash)]
  );
  scheduleSave();
  return true;
}

function clearIgnoredSets() {
  execute('DELETE FROM ignored_sets');
  execute('DELETE FROM ignored_directories');
  scheduleSave();
  return true;
}

function getIgnoredSets() {
  return queryAll('SELECT * FROM ignored_sets ORDER BY ignored_at DESC');
}

// Ignored directories tracking and operations
function getMatchingSetsForDirectory(locationId, directoryPath, activeLocationIds = []) {
  const normDir = (directoryPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  let activeIds = activeLocationIds && activeLocationIds.length > 0
    ? activeLocationIds
    : queryAll('SELECT id FROM locations WHERE is_active = 1').map(r => r.id);

  if (locationId && !activeIds.includes(locationId)) {
    activeIds = [...activeIds, locationId];
  }

  if (activeIds.length === 0) return [];

  const activePlaceholders = activeIds.map(() => '?').join(',');

  let dirCondition;
  let params;

  if (normDir === '') {
    dirCondition = "INSTR(f.relative_path, '/') = 0";
    params = [locationId, ...activeIds];
  } else {
    dirCondition = "(f.relative_path = ? OR f.relative_path LIKE ?)";
    params = [locationId, normDir, `${normDir}/%`, ...activeIds];
  }

  const sql = `
    SELECT 
      f.file_size, 
      f.quick_hash, 
      MIN(f.file_name) as file_name,
      COUNT(f.id) as matching_files_count
    FROM files f
    WHERE f.location_id = ?
      AND ${dirCondition}
      AND EXISTS (
        SELECT 1 FROM files f2
        WHERE f2.file_size = f.file_size
          AND f2.quick_hash = f.quick_hash
          AND f2.location_id IN (${activePlaceholders})
          AND f2.id != f.id
      )
    GROUP BY f.file_size, f.quick_hash
  `;

  return queryAll(sql, params);
}

function previewIgnoreDirectory(locationId, directoryPath, activeLocationIds = []) {
  const matching = getMatchingSetsForDirectory(locationId, directoryPath, activeLocationIds);
  const totalFiles = matching.reduce((sum, r) => sum + (r.matching_files_count || 1), 0);
  return {
    setsCount: matching.length,
    filesCount: totalFiles,
    directoryPath: (directoryPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  };
}

function ignoreDirectory(locationId, directoryPath, activeLocationIds = []) {
  const normDir = (directoryPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const matching = getMatchingSetsForDirectory(locationId, normDir, activeLocationIds);

  const nowIso = new Date().toISOString();
  db.run('BEGIN TRANSACTION;');
  try {
    if (matching.length > 0) {
      const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO ignored_sets (file_size, quick_hash, file_name, ignored_at) VALUES (?, ?, ?, ?)'
      );
      for (const r of matching) {
        insertStmt.run([r.file_size, r.quick_hash, r.file_name, nowIso]);
      }
      insertStmt.free();
    }

    const insertDirStmt = db.prepare(
      'INSERT OR REPLACE INTO ignored_directories (location_id, directory_path, ignored_at, sets_count) VALUES (?, ?, ?, ?)'
    );
    insertDirStmt.run([locationId, normDir, nowIso, matching.length]);
    insertDirStmt.free();

    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }

  scheduleSave();
  return {
    affectedSetsCount: matching.length,
    directoryPath: normDir,
    locationId
  };
}

function unignoreDirectory(locationId, directoryPath) {
  const normDir = (directoryPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  let dirCondition;
  let params;
  if (normDir === '') {
    dirCondition = "INSTR(relative_path, '/') = 0";
    params = [locationId];
  } else {
    dirCondition = "(relative_path = ? OR relative_path LIKE ?)";
    params = [locationId, normDir, `${normDir}/%`];
  }

  const candidateSets = queryAll(
    `SELECT DISTINCT file_size, quick_hash FROM files WHERE location_id = ? AND ${dirCondition}`,
    params
  );

  db.run('BEGIN TRANSACTION;');
  try {
    if (candidateSets.length > 0) {
      const deleteSetStmt = db.prepare(
        'DELETE FROM ignored_sets WHERE file_size = ? AND quick_hash = ?'
      );
      for (const s of candidateSets) {
        deleteSetStmt.run([s.file_size, s.quick_hash]);
      }
      deleteSetStmt.free();
    }

    execute(
      'DELETE FROM ignored_directories WHERE location_id = ? AND directory_path = ?',
      [locationId, normDir]
    );

    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }

  scheduleSave();
  return {
    restoredSetsCount: candidateSets.length,
    directoryPath: normDir,
    locationId
  };
}

function getIgnoredDirectories() {
  return queryAll(`
    SELECT id.*, l.label as location_label, l.path as location_path, l.color as location_color 
    FROM ignored_directories id 
    LEFT JOIN locations l ON id.location_id = l.id 
    ORDER BY id.ignored_at DESC
  `);
}

// Settings
function getSetting(key, defaultValue = null) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  scheduleSave();
}

// Excluded extensions management & automatic DB cleanup
function normalizeExcludedEntry(entry) {
  if (!entry || typeof entry !== 'string') return '';
  return entry
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/^\./, '');
}

function getExcludedExtensions() {
  const raw = getSetting('excluded_extensions', null);
  if (raw === null) {
    const defaults = ['xmp'];
    setSetting('excluded_extensions', JSON.stringify(defaults));
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map(normalizeExcludedEntry).filter(Boolean)));
    }
  } catch (_) {}
  // Fallback if stored as comma-separated string
  return Array.from(
    new Set(
      String(raw)
        .split(/[,;\s]+/)
        .map(normalizeExcludedEntry)
        .filter(Boolean)
    )
  );
}

function cleanExcludedFilesFromDb(extensions = []) {
  if (!db) return { removedFilesCount: 0, removedBytes: 0 };
  const normalized = Array.from(new Set((extensions || []).map(normalizeExcludedEntry).filter(Boolean)));
  if (normalized.length === 0) {
    return { removedFilesCount: 0, removedBytes: 0 };
  }

  const placeholders = normalized.map(() => '?').join(',');
  const params = [...normalized, ...normalized];

  const stats = queryOne(
    `SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size
     FROM files
     WHERE LOWER(file_extension) IN (${placeholders})
        OR LOWER(file_name) IN (${placeholders})`,
    params
  ) || { count: 0, size: 0 };

  if (stats.count > 0) {
    execute(
      `DELETE FROM files
       WHERE LOWER(file_extension) IN (${placeholders})
          OR LOWER(file_name) IN (${placeholders})`,
      params
    );

    // Recalculate total_files and total_size for all locations so UI counts remain accurate
    execute(`
      UPDATE locations
      SET total_files = (SELECT COUNT(*) FROM files WHERE files.location_id = locations.id),
          total_size = (SELECT COALESCE(SUM(file_size), 0) FROM files WHERE files.location_id = locations.id)
    `);

    saveDatabase();
  }

  return {
    removedFilesCount: stats.count || 0,
    removedBytes: stats.size || 0
  };
}

function setExcludedExtensions(extensions = []) {
  const list = Array.isArray(extensions)
    ? extensions
    : String(extensions || '').split(/[,;\s]+/);

  const normalized = Array.from(new Set(list.map(normalizeExcludedEntry).filter(Boolean)));
  setSetting('excluded_extensions', JSON.stringify(normalized));

  const cleanupResult = cleanExcludedFilesFromDb(normalized);
  saveDatabase();

  return {
    excludedExtensions: normalized,
    ...cleanupResult
  };
}

module.exports = {
  initDatabase,
  saveDatabase,
  closeDatabase,
  scheduleSave,
  queryAll,
  queryOne,
  execute,
  upsertLocation,
  updateLocation,
  getLocations,
  getLocationScanInfo,
  removeLocation,
  removeFile,
  removeFiles,
  ignoreFile,
  unignoreFile,
  getIgnoredFiles,
  ignoreSet,
  unignoreSet,
  clearIgnoredSets,
  getIgnoredSets,
  previewIgnoreDirectory,
  ignoreDirectory,
  unignoreDirectory,
  getIgnoredDirectories,
  getSetting,
  setSetting,
  getExcludedExtensions,
  setExcludedExtensions,
  cleanExcludedFilesFromDb,
  getDb: () => db
};
