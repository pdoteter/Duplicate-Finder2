const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');

async function runMultiDirectoryVerification() {
  console.log('--- STARTING MULTI-DIRECTORY DUPLICATE FINDER VERIFICATION ---');

  const testDir = path.join(__dirname, 'test_sandbox_multi');
  const shareA = path.join(testDir, 'Share_NAS_Alpha');
  const shareB = path.join(testDir, 'Share_NAS_Beta');
  const shareC = path.join(testDir, 'Share_Local_Archive');
  const dbDir = path.join(testDir, 'db_data');

  // Clean previous run
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Setup directory structures
  fs.mkdirSync(path.join(shareA, 'Photos/2022'), { recursive: true });
  fs.mkdirSync(path.join(shareA, 'Projects'), { recursive: true });

  fs.mkdirSync(path.join(shareB, 'Backup_Photos/2022'), { recursive: true });
  fs.mkdirSync(path.join(shareB, 'Unsorted'), { recursive: true });
  fs.mkdirSync(path.join(shareB, 'Duplicates_Inside_B'), { recursive: true });

  fs.mkdirSync(path.join(shareC, 'ColdStorage/Oldies'), { recursive: true });

  // 1. Cross-Directory Duplicate (exists in Share A and Share B)
  const holidayPhoto = 'BINARY_DATA_HOLIDAY_SUNSET_2022_JPG_SAMPLE_PAYLOAD_11223344';
  fs.writeFileSync(path.join(shareA, 'Photos/2022/sunset.jpg'), holidayPhoto);
  fs.writeFileSync(path.join(shareB, 'Backup_Photos/2022/sunset_copy.jpg'), holidayPhoto);

  // 2. Intra-Directory Duplicate (2 copies strictly within Share B)
  const intraDoc = 'PDF_DOCUMENT_TAX_RECORD_INTERNAL_B_DUPLICATE_CONTENT_998877';
  fs.writeFileSync(path.join(shareB, 'Unsorted/tax_form.pdf'), intraDoc);
  fs.writeFileSync(path.join(shareB, 'Duplicates_Inside_B/tax_form_backup.pdf'), intraDoc);

  // 3. Triplicate Cross-Directory (exists in Share A, Share B, and Share C)
  const multiShareVideo = 'VIDEO_MP4_4K_FAMILY_REUNION_LARGE_BINARY_SAMPLE_PAYLOAD_AABBCCDD';
  fs.writeFileSync(path.join(shareA, 'Projects/reunion.mp4'), multiShareVideo);
  fs.writeFileSync(path.join(shareB, 'Unsorted/reunion_raw.mp4'), multiShareVideo);
  fs.writeFileSync(path.join(shareC, 'ColdStorage/Oldies/reunion_archived.mp4'), multiShareVideo);

  // 4. Unique file (exists ONLY in Share A)
  const uniqueDoc = 'CONFIDENTIAL_SHARE_A_ONLY_RESEARCH_PAPER_ABC_XYZ_123';
  fs.writeFileSync(path.join(shareA, 'Projects/unique_research.doc'), uniqueDoc);

  console.log('✓ Mock network shares created.');

  // Initialize DB
  await dbService.initDatabase(dbDir);
  console.log('✓ SQLite database initialized.');

  // Register 3 locations
  const locA = dbService.upsertLocation(shareA, 'NAS Alpha (Photos & Projects)');
  const locB = dbService.upsertLocation(shareB, 'NAS Beta (Backup & Unsorted)');
  const locC = dbService.upsertLocation(shareC, 'Local Cold Storage');
  console.log(`✓ 3 Locations registered: LocA (${locA.id}), LocB (${locB.id}), LocC (${locC.id})`);

  // Scan all 3 locations
  console.log('Scanning all 3 locations...');
  await scanner.scanLocation(locA.id, shareA);
  await scanner.scanLocation(locB.id, shareB);
  await scanner.scanLocation(locC.id, shareC);
  console.log('✓ All 3 locations scanned and indexed in SQLite.');

  // Test 1: findDuplicates with ALL scope
  const allDups = comparator.findDuplicates([locA.id, locB.id, locC.id], { scope: 'ALL' });
  console.log('\n--- DUPLICATE SUMMARY (ALL) ---');
  console.log('Total Scanned Files:', allDups.summary.totalScannedFiles);
  console.log('Total Duplicate Groups:', allDups.summary.totalGroups);
  console.log('Total Duplicate Redundant Files:', allDups.summary.totalDuplicateFiles);
  console.log('Total Wasted Bytes:', allDups.summary.totalWastedBytes);
  console.log('Cross-Directory Groups:', allDups.summary.crossDirectoryGroups);
  console.log('Same-Directory Groups:', allDups.summary.sameDirectoryGroups);

  if (allDups.summary.totalGroups !== 3) {
    throw new Error(`Expected 3 duplicate groups, got ${allDups.summary.totalGroups}`);
  }
  if (allDups.summary.crossDirectoryGroups !== 2) {
    throw new Error(`Expected 2 cross-directory groups, got ${allDups.summary.crossDirectoryGroups}`);
  }
  if (allDups.summary.sameDirectoryGroups !== 1) {
    throw new Error(`Expected 1 same-directory group, got ${allDups.summary.sameDirectoryGroups}`);
  }
  console.log('✓ Verified duplicate grouping & scoping counts!');

  // Test 2: findDuplicates with CROSS_DIRECTORY filter
  const crossDups = comparator.findDuplicates([locA.id, locB.id, locC.id], { scope: 'CROSS_DIRECTORY' });
  if (crossDups.groups.length !== 2) {
    throw new Error(`Expected 2 cross-directory groups in filtered list, got ${crossDups.groups.length}`);
  }
  console.log('✓ Verified CROSS_DIRECTORY scope filter!');

  // Test 3: findDuplicates with SAME_DIRECTORY filter
  const sameDups = comparator.findDuplicates([locA.id, locB.id, locC.id], { scope: 'SAME_DIRECTORY' });
  if (sameDups.groups.length !== 1) {
    throw new Error(`Expected 1 same-directory group in filtered list, got ${sameDups.groups.length}`);
  }
  console.log('✓ Verified SAME_DIRECTORY scope filter!');

  // Test 4: Verify Unique Files Detection
  // Check Share A for unique files (unique_research.doc should be the only unique file)
  console.log('\nTesting Unique Files in Share A...');
  const uniqueInA = comparator.getUniqueFiles(locA.id, [locB.id, locC.id]);
  console.log('Unique files in Share A count:', uniqueInA.summary.totalUniqueFiles);
  if (uniqueInA.summary.totalUniqueFiles !== 1) {
    throw new Error(`Expected 1 unique file in Share A, got ${uniqueInA.summary.totalUniqueFiles}`);
  }
  if (uniqueInA.files[0].file_name !== 'unique_research.doc') {
    throw new Error(`Expected unique file to be unique_research.doc, got ${uniqueInA.files[0].file_name}`);
  }
  console.log('✓ Successfully detected unique file in Share A:', uniqueInA.files[0].relative_path);

  // Test 5: Verify Share Stats Breakdown
  console.log('\nTesting Share Breakdown & Health Stats...');
  const stats = comparator.getLocationsStats([locA.id, locB.id, locC.id]);
  for (const s of stats) {
    console.log(`Share "${s.label}": Total ${s.totalFiles} files (${s.totalBytes} B), Duplicates: ${s.duplicateFiles} files, Unique: ${s.uniqueFiles} files (${s.duplicatePercentage}% dup)`);
  }
  if (stats.length !== 3) {
    throw new Error(`Expected stats for 3 locations, got ${stats.length}`);
  }
  console.log('✓ Verified Share breakdown statistics!');

  // Test 6: Deletion simulation
  console.log('\nTesting File Deletion & DB Update...');
  const firstDupGroup = allDups.groups.find(g => g.files.some(f => f.file_name === 'tax_form_backup.pdf'));
  const fileToDelete = firstDupGroup.files.find(f => f.file_name === 'tax_form_backup.pdf');

  dbService.removeFile(fileToDelete.id);
  const recheckDups = comparator.findDuplicates([locA.id, locB.id, locC.id], { scope: 'ALL' });
  if (recheckDups.summary.totalGroups !== 2) {
    throw new Error(`Expected 2 duplicate groups after deleting one copy, got ${recheckDups.summary.totalGroups}`);
  }
  console.log('✓ Successfully deleted duplicate and verified updated group count!');

  // Cleanup test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log('\n=============================================================');
  console.log('🎉 ALL MULTI-DIRECTORY DUPLICATE FINDER TESTS PASSED! 🎉');
  console.log('=============================================================\n');
}

runMultiDirectoryVerification().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
