const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');

async function testShareFilterAndDecisions() {
  console.log('=== STARTING SHARE FILTER & DECISION LOGIC VERIFICATION ===');

  const testDir = path.join(__dirname, 'test_sandbox_share_filter');
  const shareMaster = path.join(testDir, 'MasterShare');
  const shareBackup = path.join(testDir, 'BackupTimelapses');
  const shareArchive = path.join(testDir, 'ColdArchive');
  const dbDir = path.join(testDir, 'db_data');

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(shareMaster, 'Projects/2026'), { recursive: true });
  fs.mkdirSync(path.join(shareMaster, 'Docs'), { recursive: true });

  fs.mkdirSync(path.join(shareBackup, 'Sync/Projects/2026'), { recursive: true });
  fs.mkdirSync(path.join(shareBackup, 'LocalDuplicates/A'), { recursive: true });
  fs.mkdirSync(path.join(shareBackup, 'LocalDuplicates/B'), { recursive: true });

  fs.mkdirSync(path.join(shareArchive, 'ColdDocs'), { recursive: true });

  // 1. Cross-share duplicate between Master and Backup
  const projectPayload = 'SAMPLE_PROJECT_FILE_PAYLOAD_ABC_123_456_789';
  fs.writeFileSync(path.join(shareMaster, 'Projects/2026/timelapse_01.mp4'), projectPayload);
  fs.writeFileSync(path.join(shareBackup, 'Sync/Projects/2026/timelapse_01.mp4'), projectPayload);

  // 2. Intra-share duplicate strictly inside BackupTimelapses
  const backupLocalPayload = 'INTERNAL_BACKUP_TIMELAPSE_LOCAL_COPY_ONLY_999';
  fs.writeFileSync(path.join(shareBackup, 'LocalDuplicates/A/internal_clip.mp4'), backupLocalPayload);
  fs.writeFileSync(path.join(shareBackup, 'LocalDuplicates/B/internal_clip_backup.mp4'), backupLocalPayload);

  // 3. Cross-share duplicate between Master and ColdArchive (NOT in BackupTimelapses)
  const masterArchivePayload = 'DOCUMENT_PAYLOAD_MASTER_AND_COLD_ARCHIVE_ONLY_777';
  fs.writeFileSync(path.join(shareMaster, 'Docs/report.pdf'), masterArchivePayload);
  fs.writeFileSync(path.join(shareArchive, 'ColdDocs/report_old.pdf'), masterArchivePayload);

  // 4. Unique file in BackupTimelapses
  fs.writeFileSync(path.join(shareBackup, 'unique_in_backup.txt'), 'UNIQUE_TO_BACKUP_ONLY');

  console.log('✓ Mock shares & file payloads generated.');

  await dbService.initDatabase(dbDir);
  const locMaster = dbService.upsertLocation(shareMaster, 'Master');
  const locBackup = dbService.upsertLocation(shareBackup, 'BackupTimelapses');
  const locArchive = dbService.upsertLocation(shareArchive, 'ColdArchive');

  console.log(`✓ Registered locations: Master (${locMaster.id}), Backup (${locBackup.id}), Archive (${locArchive.id})`);

  await scanner.scanLocation(locMaster.id, shareMaster);
  await scanner.scanLocation(locBackup.id, shareBackup);
  await scanner.scanLocation(locArchive.id, shareArchive);
  console.log('✓ Scanned all locations.');

  const allActiveIds = [locMaster.id, locBackup.id, locArchive.id];

  // Test 1: findDuplicates with NO filter - should return 3 groups
  const allDups = comparator.findDuplicates(allActiveIds);
  console.log('Total unfiltered duplicate groups:', allDups.groups.length);
  if (allDups.groups.length !== 3) {
    throw new Error(`Expected 3 duplicate groups overall, got ${allDups.groups.length}`);
  }

  // Test 2: findDuplicates with filterLocationId = locBackup.id
  // Should return ONLY the 2 groups involving BackupTimelapses (project duplicate + intra duplicate)
  // And EXCLUDE the Master <-> Archive duplicate!
  const backupFiltered = comparator.findDuplicates(allActiveIds, { filterLocationId: locBackup.id });
  console.log('Filtered duplicate groups for BackupTimelapses:', backupFiltered.groups.length);
  if (backupFiltered.groups.length !== 2) {
    throw new Error(`Expected 2 duplicate groups for BackupTimelapses, got ${backupFiltered.groups.length}`);
  }

  // Verify the groups returned actually contain files from BackupTimelapses
  for (const group of backupFiltered.groups) {
    const hasBackupFile = group.files.some(f => f.location_id === locBackup.id);
    if (!hasBackupFile) {
      throw new Error(`Group ${group.fileName} does not contain any file from BackupTimelapses!`);
    }
    console.log(`  ✓ Verified group "${group.fileName}" involves BackupTimelapses (Locations: ${group.locationsInvolved.join(', ')})`);
  }

  // Test 3: computeSmartSelection with KEEP_LOCATION (Keep in BackupTimelapses)
  const smartKeepInBackup = comparator.computeSmartSelection(allActiveIds, 'KEEP_LOCATION', {
    targetLocationId: locBackup.id,
    filterLocationId: locBackup.id
  });
  console.log('Smart selection (KEEP_LOCATION in BackupTimelapses) selected count:', smartKeepInBackup.totalSelectedCount);
  // In group 1 (Master + Backup): Master file should be selected for deletion (Backup kept)
  // In group 2 (Backup A + Backup B): 1 of the Backup copies selected for deletion (1 Backup kept)
  // Total selected = 2 files
  if (smartKeepInBackup.totalSelectedCount !== 2) {
    throw new Error(`Expected 2 selected files for deletion with KEEP_LOCATION, got ${smartKeepInBackup.totalSelectedCount}`);
  }
  console.log('✓ Verified KEEP_LOCATION keeps BackupTimelapses files and marks other copies!');

  // Test 4: computeSmartSelection with KEEP_OTHER_LOCATIONS (Clean BackupTimelapses)
  const smartCleanBackup = comparator.computeSmartSelection(allActiveIds, 'KEEP_OTHER_LOCATIONS', {
    targetLocationId: locBackup.id,
    filterLocationId: locBackup.id
  });
  console.log('Smart selection (KEEP_OTHER_LOCATIONS / Clean Backup) selected count:', smartCleanBackup.totalSelectedCount);
  // In group 1 (Master + Backup): Backup file selected for deletion (Master kept)
  // In group 2 (Backup A + Backup B): 1 Backup file selected for deletion (1 Backup kept safe)
  // Total selected = 2 files
  if (smartCleanBackup.totalSelectedCount !== 2) {
    throw new Error(`Expected 2 selected files with KEEP_OTHER_LOCATIONS, got ${smartCleanBackup.totalSelectedCount}`);
  }

  // Verify that the Master file in group 1 was NOT marked for deletion in KEEP_OTHER_LOCATIONS
  const masterFile = dbService.queryOne('SELECT id FROM files WHERE location_id = ? AND file_name = ?', [locMaster.id, 'timelapse_01.mp4']);
  if (smartCleanBackup.selectedFileIds.includes(masterFile.id)) {
    throw new Error('Master copy was unexpectedly selected for deletion when KEEP_OTHER_LOCATIONS was used!');
  }
  const backupFile = dbService.queryOne('SELECT id FROM files WHERE location_id = ? AND file_name = ?', [locBackup.id, 'timelapse_01.mp4']);
  if (!smartCleanBackup.selectedFileIds.includes(backupFile.id)) {
    throw new Error('Backup copy was not selected for deletion when KEEP_OTHER_LOCATIONS was used!');
  }
  console.log('✓ Verified KEEP_OTHER_LOCATIONS successfully cleans Backup share while preserving Master copy!');

  // Test 5: computeSmartSelection with KEEP_FIRST and KEEP_SECOND
  const smartKeepFirst = comparator.computeSmartSelection(allActiveIds, 'KEEP_FIRST');
  const smartKeepSecond = comparator.computeSmartSelection(allActiveIds, 'KEEP_SECOND');
  if (smartKeepFirst.totalSelectedCount !== 3 || smartKeepSecond.totalSelectedCount !== 3) {
    throw new Error(`Expected 3 selected files for KEEP_FIRST and KEEP_SECOND, got ${smartKeepFirst.totalSelectedCount} and ${smartKeepSecond.totalSelectedCount}`);
  }
  // For 2-file groups, KEEP_FIRST and KEEP_SECOND must select completely disjoint sets of files
  const overlap = smartKeepFirst.selectedFileIds.filter(id => smartKeepSecond.selectedFileIds.includes(id));
  if (overlap.length !== 0) {
    throw new Error(`Expected KEEP_FIRST and KEEP_SECOND to select different copies in 2-copy groups, but overlapped on IDs: ${overlap.join(', ')}`);
  }
  console.log('✓ Verified KEEP_FIRST and KEEP_SECOND select opposite copies in 2-copy groups!');

  // Test 6: computeSmartSelection with INVERT
  const smartInverted = comparator.computeSmartSelection(allActiveIds, 'INVERT', {
    currentSelectedIds: smartKeepFirst.selectedFileIds
  });
  const sortedSecond = [...smartKeepSecond.selectedFileIds].sort((a, b) => a - b);
  const sortedInverted = [...smartInverted.selectedFileIds].sort((a, b) => a - b);
  if (JSON.stringify(sortedSecond) !== JSON.stringify(sortedInverted)) {
    throw new Error(`Expected INVERT of KEEP_FIRST (${sortedInverted}) to match KEEP_SECOND (${sortedSecond})`);
  }
  console.log('✓ Verified INVERT accurately swaps kept and selected copies across duplicate groups!');

  // Cleanup test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log('\n=============================================================');
  console.log('🎉 ALL SHARE FILTER & DECISION TESTS PASSED! 🎉');
  console.log('=============================================================\n');
}

testShareFilterAndDecisions().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
