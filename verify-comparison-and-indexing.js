const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');
const fileOps = require('./electron/services/fileOps');

async function runVerification() {
  console.log('--- STARTING BACKUP COMPARATOR VERIFICATION ---');

  const testDir = path.join(__dirname, 'test_sandbox');
  const masterDir = path.join(testDir, 'Master');
  const backupDir = path.join(testDir, 'Backup');
  const dbDir = path.join(testDir, 'db_data');

  // Clean previous run
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Setup directory structures
  fs.mkdirSync(path.join(masterDir, 'Documents/2021'), { recursive: true });
  fs.mkdirSync(path.join(masterDir, 'Photos/Archive'), { recursive: true });

  fs.mkdirSync(path.join(backupDir, 'Documents/2021'), { recursive: true });
  fs.mkdirSync(path.join(backupDir, 'Photos/OldAlbum'), { recursive: true });
  fs.mkdirSync(path.join(backupDir, 'Unsorted_2019'), { recursive: true });

  // 1. Exact Duplicate: file with same path and identical content
  const dupContent = 'This is an identical duplicate document across both master and backup.';
  fs.writeFileSync(path.join(masterDir, 'Documents/2021/report.txt'), dupContent);
  fs.writeFileSync(path.join(backupDir, 'Documents/2021/report.txt'), dupContent);

  // 2. Conflict / Modified: same path, differing content
  fs.writeFileSync(path.join(masterDir, 'Documents/2021/budget.txt'), 'Budget Version 2 (Master)');
  fs.writeFileSync(path.join(backupDir, 'Documents/2021/budget.txt'), 'Budget Version 1 (Old Backup)');

  // 3. Relocated: same content, different path
  const relocatedContent = 'Relocated family photo content binary payload sample 1234567890';
  fs.writeFileSync(path.join(masterDir, 'Photos/Archive/vacation.jpg'), relocatedContent);
  fs.writeFileSync(path.join(backupDir, 'Photos/OldAlbum/vacation.jpg'), relocatedContent);

  // 4. Missing in Master: exists ONLY in Backup! (This is what the user is most afraid to lose)
  const uniqueContent = 'IMPORTANT TAX RECEIPT 2019 - MUST NOT BE LOST!';
  fs.writeFileSync(path.join(backupDir, 'Unsorted_2019/receipt_2019.pdf'), uniqueContent);

  console.log('✓ Mock filesystem created.');

  // Initialize DB
  await dbService.initDatabase(dbDir);
  console.log('✓ SQLite database initialized.');

  // Register locations
  const masterLoc = dbService.upsertLocation(masterDir, 'master', 'Master Share');
  const backupLoc = dbService.upsertLocation(backupDir, 'backup', 'Old Backup Share');
  console.log(`✓ Locations registered: Master (ID ${masterLoc.id}), Backup (ID ${backupLoc.id})`);

  // Scan Master
  console.log('Scanning Master folder...');
  const masterScan = await scanner.scanLocation(masterLoc.id, masterDir, (p) => {
    // progress
  });
  console.log(`✓ Master scanned: ${masterScan.totalFiles} files, ${masterScan.totalBytes} bytes.`);

  // Scan Backup
  console.log('Scanning Backup folder...');
  const backupScan = await scanner.scanLocation(backupLoc.id, backupDir, (p) => {
    // progress
  });
  console.log(`✓ Backup scanned: ${backupScan.totalFiles} files, ${backupScan.totalBytes} bytes.`);

  // Verify Master Directory Tree
  const masterTree = comparator.getMasterDirectoryTree(masterLoc.id, backupLoc.id);
  console.log(`✓ Master Directory Tree generated with ${masterTree.children.length} top-level folders.`);

  // Run Comparison
  console.log('Running comparison between Backup and Master...');
  const compResult = comparator.compareBackupWithMaster(masterLoc.id, backupLoc.id, { statusFilter: 'ALL' });

  console.log('--- COMPARISON RESULTS ---');
  console.log('Total Backup Files:', compResult.summary.totalBackupFiles);
  console.log('🚨 Missing in Master:', compResult.summary.missingInMaster);
  console.log('⚠️ Conflicts/Modified:', compResult.summary.conflicts);
  console.log('🔁 Relocated:', compResult.summary.relocated);
  console.log('✅ Exact Duplicates:', compResult.summary.exactDuplicates);

  // Assertions
  if (compResult.summary.missingInMaster !== 1) {
    throw new Error(`Expected 1 missing file in master, got ${compResult.summary.missingInMaster}`);
  }
  if (compResult.summary.conflicts !== 1) {
    throw new Error(`Expected 1 conflict, got ${compResult.summary.conflicts}`);
  }
  if (compResult.summary.relocated !== 1) {
    throw new Error(`Expected 1 relocated file, got ${compResult.summary.relocated}`);
  }
  if (compResult.summary.exactDuplicates !== 1) {
    throw new Error(`Expected 1 exact duplicate, got ${compResult.summary.exactDuplicates}`);
  }

  const missingItem = compResult.files.find(f => f.status === 'MISSING_IN_MASTER');
  console.log(`✓ Successfully detected missing file: ${missingItem.backupFile.relative_path}`);

  // Test Ignoring a Missing in Master file
  console.log('Testing "Ignore" on missing file...');
  dbService.ignoreFile(backupLoc.id, missingItem.backupFile.relative_path, 'User ignored receipt');
  
  let compAfterIgnore = comparator.compareBackupWithMaster(masterLoc.id, backupLoc.id, { statusFilter: 'ALL' });
  console.log('--- RE-COMPARISON AFTER IGNORE ---');
  console.log('🚨 Missing in Master:', compAfterIgnore.summary.missingInMaster);
  console.log('👁️ Ignored:', compAfterIgnore.summary.ignored);
  
  if (compAfterIgnore.summary.missingInMaster !== 0) {
    throw new Error(`Expected 0 missing files after ignore, got ${compAfterIgnore.summary.missingInMaster}`);
  }
  if (compAfterIgnore.summary.ignored !== 1) {
    throw new Error(`Expected 1 ignored file, got ${compAfterIgnore.summary.ignored}`);
  }
  
  const ignoredItem = compAfterIgnore.files.find(f => f.status === 'IGNORED');
  if (!ignoredItem || !ignoredItem.ignoredAt) {
    throw new Error('Ignored item was not tracked with ignoredAt timestamp in results!');
  }
  console.log(`✓ Successfully verified ignored file tracked: ${ignoredItem.backupFile.relative_path} (at ${ignoredItem.ignoredAt})`);

  // Verify statusFilter: 'IGNORED'
  const filterIgnored = comparator.compareBackupWithMaster(masterLoc.id, backupLoc.id, { statusFilter: 'IGNORED' });
  if (filterIgnored.totalCount !== 1 || filterIgnored.files[0].status !== 'IGNORED') {
    throw new Error('statusFilter IGNORED did not return the ignored file');
  }
  console.log('✓ Successfully filtered by statusFilter IGNORED');

  // Test Unignoring the file
  console.log('Testing "Unignore" on the file...');
  dbService.unignoreFile(backupLoc.id, missingItem.backupFile.relative_path);
  let compAfterUnignore = comparator.compareBackupWithMaster(masterLoc.id, backupLoc.id, { statusFilter: 'ALL' });
  if (compAfterUnignore.summary.missingInMaster !== 1 || compAfterUnignore.summary.ignored !== 0) {
    throw new Error('Unignore failed to restore missing status');
  }
  console.log('✓ Unignore restored file to Missing in Master successfully.');

  // Test Copy to Master: mirror the missing file directly to Master!
  console.log('Testing "Copy to Master" for missing file...');
  const copyRes = await fileOps.copyFileToMaster(
    masterLoc.id,
    masterDir,
    backupDir,
    missingItem.backupFile.relative_path
  );
  console.log(`✓ File copied to Master: ${copyRes.targetPath}`);

  // Verify file actually exists on disk in Master with mirrored folder
  const copiedOnDisk = fs.existsSync(path.join(masterDir, 'Unsorted_2019/receipt_2019.pdf'));
  if (!copiedOnDisk) {
    throw new Error('Copied file does not exist on disk at target location!');
  }
  const copiedContent = fs.readFileSync(path.join(masterDir, 'Unsorted_2019/receipt_2019.pdf'), 'utf8');
  if (copiedContent !== uniqueContent) {
    throw new Error('Copied file content does not match source content!');
  }
  console.log('✓ Disk file verification passed: Content and relative folder match perfectly.');

  // Re-run comparison: missing in master should now be 0, and exact duplicates should now be 2!
  const updatedComp = comparator.compareBackupWithMaster(masterLoc.id, backupLoc.id, { statusFilter: 'ALL' });
  console.log('--- RE-COMPARISON AFTER COPY ---');
  console.log('🚨 Missing in Master:', updatedComp.summary.missingInMaster);
  console.log('✅ Exact Duplicates:', updatedComp.summary.exactDuplicates);

  if (updatedComp.summary.missingInMaster !== 0) {
    throw new Error(`Expected 0 missing files after copy, got ${updatedComp.summary.missingInMaster}`);
  }
  if (updatedComp.summary.exactDuplicates !== 2) {
    throw new Error(`Expected 2 exact duplicates after copy, got ${updatedComp.summary.exactDuplicates}`);
  }

  // Clean up test sandbox
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('✓ Test sandbox cleaned up.');

  console.log('==================================================');
  console.log('🎉 ALL INTEGRATION AND COMPARISON TESTS PASSED! 🎉');
  console.log('==================================================');
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
