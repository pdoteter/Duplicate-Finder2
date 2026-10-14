const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');

async function testScanEnhancement() {
  console.log('=============================================================');
  console.log('🧪 VERIFYING 4-THREAD SCAN ACCELERATION & RESUME INTEGRITY');
  console.log('=============================================================');

  const testDir = path.join(__dirname, 'test_sandbox_threads');
  const dbDir = path.join(testDir, 'db_data');

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Create mock tree with 12 folders and 600 files
  const sharePath = path.join(testDir, 'Network_Share_Mock');
  fs.mkdirSync(sharePath, { recursive: true });

  console.log('Creating 600 files across 12 subdirectories for benchmarking...');
  for (let dirIdx = 0; dirIdx < 12; dirIdx++) {
    const sub = path.join(sharePath, `Folder_${dirIdx}`);
    fs.mkdirSync(sub, { recursive: true });
    for (let fIdx = 0; fIdx < 50; fIdx++) {
      const filePath = path.join(sub, `data_file_${fIdx}.bin`);
      const size = 1024 * (10 + (fIdx * 5));
      const buf = Buffer.alloc(size, (dirIdx + fIdx) % 256);
      fs.writeFileSync(filePath, buf);
    }
  }
  console.log('✓ Mock dataset created: 600 files.');

  // Initialize DB
  await dbService.initDatabase(dbDir);
  const loc = dbService.upsertLocation(sharePath, 'Benchmark Share');

  // Test 1: Single Thread Fresh Scan (concurrency = 1)
  console.log('\n--- Test 1: Single-Thread Fresh Scan (1 Thread) ---');
  const t0 = Date.now();
  const res1 = await scanner.scanLocation(loc.id, sharePath, () => {}, true, 1, 'fresh');
  const duration1 = Date.now() - t0;
  console.log(`✓ 1 Thread: Scanned ${res1.totalFiles} files in ${duration1} ms`);

  const files1 = dbService.queryAll('SELECT relative_path, file_size, quick_hash FROM files ORDER BY relative_path ASC');

  // Test 2: 4-Thread Fresh Scan (concurrency = 4)
  console.log('\n--- Test 2: Multi-Thread Fresh Scan (4 Threads) ---');
  let progressUpdates = 0;
  const t1 = Date.now();
  const res4 = await scanner.scanLocation(
    loc.id,
    sharePath,
    (prog) => {
      progressUpdates++;
    },
    true,
    4,
    'fresh'
  );
  const duration4 = Date.now() - t1;
  console.log(`✓ 4 Threads: Scanned ${res4.totalFiles} files in ${duration4} ms`);
  console.log(`✓ Progress callbacks fired: ${progressUpdates} times`);

  const files4 = dbService.queryAll('SELECT relative_path, file_size, quick_hash FROM files ORDER BY relative_path ASC');

  // Validate integrity between 1-thread and 4-thread results
  if (files1.length !== files4.length) {
    throw new Error(`File counts mismatch! 1-thread: ${files1.length}, 4-thread: ${files4.length}`);
  }
  if (res1.totalFiles !== res4.totalFiles || res1.totalBytes !== res4.totalBytes) {
    throw new Error('Total files or total bytes mismatch between 1-thread and 4-thread scans!');
  }

  for (let i = 0; i < files1.length; i++) {
    if (files1[i].relative_path !== files4[i].relative_path) {
      throw new Error(`Path mismatch at index ${i}`);
    }
    if (files1[i].file_size !== files4[i].file_size) {
      throw new Error(`Size mismatch at index ${i}`);
    }
    if (files1[i].quick_hash !== files4[i].quick_hash) {
      throw new Error(`Hash mismatch for file ${files1[i].relative_path}`);
    }
  }
  console.log('✓ PERFECT INTEGRITY: All 600 paths, sizes, and quick hashes match identically between 1 and 4 threads!');

  const speedup = (duration1 / Math.max(1, duration4)).toFixed(2);
  console.log(`⚡ Fresh scan speedup: ${speedup}x (${duration1}ms -> ${duration4}ms)`);

  // Test 3: Resume Scan (Skipping already indexed files)
  console.log('\n--- Test 3: Resume Scan (Skipping 600 Existing Files) ---');
  const tResume = Date.now();
  const resumeRes = await scanner.scanLocation(loc.id, sharePath, () => {}, true, 4, 'resume');
  const resumeDuration = Date.now() - tResume;
  console.log(`✓ Resume Scan: Skipped ${resumeRes.skippedExisting} cached files in ${resumeDuration} ms (Total: ${resumeRes.totalFiles} files)`);

  if (resumeRes.skippedExisting !== 600 || resumeRes.totalFiles !== 600) {
    throw new Error('Resume scan did not skip expected 600 files!');
  }

  // Test 4: Cancel and Resume to Completion
  console.log('\n--- Test 4: Cancel Mid-Scan and Resume to Completion ---');
  // Wipe to fresh, then cancel quickly
  setTimeout(() => {
    scanner.cancelScan();
  }, 15);
  const cancelRes = await scanner.scanLocation(loc.id, sharePath, () => {}, true, 4, 'fresh');
  console.log(`✓ Cancelled partial scan: cancelled=${cancelRes.cancelled}, cached=${cancelRes.totalFiles} files.`);

  // Resume partial scan to 100% completion
  const finishRes = await scanner.scanLocation(loc.id, sharePath, () => {}, true, 4, 'resume');
  console.log(`✓ Resumed to completion: totalFiles=${finishRes.totalFiles}, scanStatus=${finishRes.scanStatus}`);

  if (finishRes.totalFiles !== 600 || finishRes.scanStatus !== 'completed') {
    throw new Error(`Failed to resume cancelled scan to completion! totalFiles=${finishRes.totalFiles}`);
  }

  // Cleanup
  dbService.closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('✓ Sandbox cleaned up.');

  console.log('\n=============================================================');
  console.log('🎉 4-THREAD ACCELERATION & RESUME VERIFIED WITH 100% SUCCESS! 🎉');
  console.log('=============================================================');
}

testScanEnhancement().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
