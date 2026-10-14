const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');
const fileOps = require('./electron/services/fileOps');

async function testQuarantineMove() {
  console.log('=== STARTING QUARANTINE MOVE TEST ===\n');

  const testRoot = path.join(__dirname, 'test_sandbox_quarantine');
  const shareA = path.join(testRoot, 'Mock_Share');
  const dbDir = path.join(testRoot, 'db_data');

  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  // 1. Create directory structure with duplicates
  fs.mkdirSync(path.join(shareA, 'Documents/Reports'), { recursive: true });
  fs.mkdirSync(path.join(shareA, 'Backups/Reports'), { recursive: true });

  const contentA = 'CONFIDENTIAL_REPORT_DUPLICATE_PAYLOAD_DATA_12345';
  const originalFile = path.join(shareA, 'Documents/Reports/annual_2025.pdf');
  const duplicateFile = path.join(shareA, 'Backups/Reports/annual_2025_dup.pdf');

  fs.writeFileSync(originalFile, contentA);
  fs.writeFileSync(duplicateFile, contentA);

  console.log('1. Mock share files created.');

  // 2. Initialize DB & scan share
  await dbService.initDatabase(dbDir);
  const loc = dbService.upsertLocation(shareA, 'Mock Share A');
  console.log('2. Location added, scanning...');

  await scanner.scanLocation(loc.id, shareA);
  const dupsBefore = comparator.findDuplicates([loc.id]);
  console.log('Duplicates before cleanup:', dupsBefore.summary.totalGroups, 'groups,', dupsBefore.summary.totalDuplicateFiles, 'duplicate files');
  if (dupsBefore.summary.totalGroups !== 1) {
    throw new Error(`Expected 1 duplicate group, found ${dupsBefore.summary.totalGroups}`);
  }

  const group = dupsBefore.groups[0];
  const fileToQuarantine = group.files.find(f => f.file_name === 'annual_2025_dup.pdf');

  // 3. Perform Quarantine Move
  console.log('3. Moving duplicate file to quarantine folder...');
  const res = await fileOps.deleteFile(fileToQuarantine.id, {
    action: 'quarantine',
    quarantineFolder: '_duplicates_trash'
  });

  console.log('Quarantine result:', res);
  if (!res.success) {
    throw new Error('Quarantine operation did not succeed');
  }

  // 4. Verify source file no longer in original path
  if (fs.existsSync(duplicateFile)) {
    throw new Error('Duplicate file still exists in original folder!');
  }
  console.log('✓ Original duplicate copy was moved from source directory.');

  // 5. Verify file exists in _duplicates_trash with preserved relative path
  const expectedQuarantinePath = path.join(shareA, '_duplicates_trash', 'Backups/Reports/annual_2025_dup.pdf');
  if (!fs.existsSync(expectedQuarantinePath)) {
    throw new Error(`Quarantined file not found at expected path: ${expectedQuarantinePath}`);
  }
  const quarantinedContent = fs.readFileSync(expectedQuarantinePath, 'utf8');
  if (quarantinedContent !== contentA) {
    throw new Error('Quarantined file content mismatch!');
  }
  console.log('✓ File correctly preserved in quarantine folder with full hierarchy:', expectedQuarantinePath);

  // 6. Verify SQLite record removed
  const dbFileCheck = dbService.queryOne('SELECT * FROM files WHERE id = ?', [fileToQuarantine.id]);
  if (dbFileCheck) {
    throw new Error('File record still exists in SQLite DB!');
  }
  console.log('✓ File record removed from database.');

  // 7. Verify rescan skips _duplicates_trash
  console.log('4. Performing rescan to ensure scanner excludes quarantine folder...');
  await scanner.scanLocation(loc.id, shareA, () => {}, true, 4, 'fresh');
  const dupsAfter = comparator.findDuplicates([loc.id]);
  console.log('Duplicates after rescan:', dupsAfter.summary.totalGroups, 'groups');
  if (dupsAfter.summary.totalGroups !== 0) {
    throw new Error(`Scanner indexed the quarantine folder! Expected 0 duplicate groups, got ${dupsAfter.summary.totalGroups}`);
  }
  console.log('✓ Quarantine folder was automatically ignored by scanner!');

  // Clean up sandbox
  dbService.closeDatabase();
  fs.rmSync(testRoot, { recursive: true, force: true });

  console.log('\n=======================================');
  console.log('🎉 QUARANTINE MOVE TEST PASSED 100%! 🎉');
  console.log('=======================================\n');
}

testQuarantineMove().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
