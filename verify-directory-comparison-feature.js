const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');

async function runVerification() {
  console.log('=== STARTING DIRECTORY COMPARISON & SMART SELECTION VERIFICATION ===\n');

  // Test 1: Unit tests for parseDirectoryInfo
  console.log('--- Test 1: Testing parseDirectoryInfo ---');
  const rootTest = comparator.parseDirectoryInfo('sunset_Profile.mov');
  if (!rootTest.isRoot || rootTest.depth !== 0 || rootTest.dirPath !== '' || rootTest.parentDir !== '') {
    throw new Error(`parseDirectoryInfo root test failed: ${JSON.stringify(rootTest)}`);
  }
  console.log('✓ Root file correctly identified as isRoot: true, depth: 0');

  const subfolderTest = comparator.parseDirectoryInfo('2020/TLMG4800-03/20200818223838_Nederland/sunset_Profile.mov');
  if (subfolderTest.isRoot || subfolderTest.depth !== 3 || subfolderTest.parentDir !== '20200818223838_Nederland') {
    throw new Error(`parseDirectoryInfo subfolder test failed: ${JSON.stringify(subfolderTest)}`);
  }
  console.log('✓ Subfolder file correctly identified: depth 3, parentDir "20200818223838_Nederland"');

  // Test 2: Unit tests for getDirectoryInsight
  console.log('\n--- Test 2: Testing getDirectoryInsight ---');
  const sampleGroupFiles = [
    { isRoot: true, dirPath: '', depth: 0 },
    { isRoot: true, dirPath: '', depth: 0 },
    { isRoot: false, dirPath: '2020/TLMG4800-03/20200818223838_Nederland', depth: 3 }
  ];
  const insight = comparator.getDirectoryInsight(sampleGroupFiles, [1, 2]);
  if (insight.type !== 'ROOT_VS_SUBFOLDER') {
    throw new Error(`Expected ROOT_VS_SUBFOLDER but got ${insight.type}`);
  }
  console.log(`✓ Insight generated: "${insight.text}" (Badge: ${insight.badge})`);

  // Test 3: Sandbox database with duplicate sets in different directories
  console.log('\n--- Test 3: End-to-end multi-directory duplicate comparison & smart selection ---');
  const testRoot = path.join(__dirname, 'test_sandbox_dir_compare');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  const share1 = path.join(testRoot, 'share_videos');
  const share2 = path.join(testRoot, 'share_pictures');
  const share3 = path.join(testRoot, 'share_previews');
  const dbDir = path.join(testRoot, 'db_data');

  fs.mkdirSync(share1, { recursive: true });
  fs.mkdirSync(share2, { recursive: true });
  fs.mkdirSync(share3, { recursive: true });
  fs.mkdirSync(dbDir, { recursive: true });

  // Initialize DB
  await dbService.initDatabase(dbDir);
  const loc1 = dbService.upsertLocation(share1, 'ShareVideos');
  const loc2 = dbService.upsertLocation(share2, 'SharePictures');
  const loc3 = dbService.upsertLocation(share3, 'SharePreviews');

  // Create duplicate files mimicking the user's exact case:
  // sunset.mov in 3 places:
  // Place 1: share1 root (depth 0)
  // Place 2: share2 root (depth 0)
  // Place 3: share3 subfolder 2020/TLMG/Nederland (depth 3)
  const movContent = Buffer.alloc(1024 * 130, 'V'); // 130 KB to trigger progressive hash
  fs.writeFileSync(path.join(share1, 'sunset_Profile.mov'), movContent);
  fs.writeFileSync(path.join(share2, 'sunset_Profile.mov'), movContent);

  const subDir = path.join(share3, '2020', 'TLMG4800-03', '20200818223838_Nederland');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'sunset_Profile.mov'), movContent);

  // Another set: project.pdf in share1 and share2, same subfolder
  const pdfSub1 = path.join(share1, 'Docs', '2024');
  const pdfSub2 = path.join(share2, 'Docs', '2024');
  fs.mkdirSync(pdfSub1, { recursive: true });
  fs.mkdirSync(pdfSub2, { recursive: true });
  fs.writeFileSync(path.join(pdfSub1, 'report.pdf'), 'PDF content identical');
  fs.writeFileSync(path.join(pdfSub2, 'report.pdf'), 'PDF content identical');

  // Scan all 3 locations
  await scanner.scanLocation(loc1.id, share1, () => {}, true, 2, 'fresh');
  await scanner.scanLocation(loc2.id, share2, () => {}, true, 2, 'fresh');
  await scanner.scanLocation(loc3.id, share3, () => {}, true, 2, 'fresh');

  // Query duplicates
  const dupResult = comparator.findDuplicates([loc1.id, loc2.id, loc3.id]);
  console.log(`✓ Scanned and grouped ${dupResult.groups.length} duplicate groups.`);

  const sunsetGroup = dupResult.groups.find(g => g.fileName === 'sunset_Profile.mov');
  if (!sunsetGroup) {
    throw new Error('sunset_Profile group not found!');
  }

  console.log('\n--- Inspecting sunset_Profile group directory comparison ---');
  console.log(`Group fileName: ${sunsetGroup.fileName}`);
  console.log(`Files count: ${sunsetGroup.fileCount}`);
  console.log(`hasDifferentDirs: ${sunsetGroup.hasDifferentDirs}`);
  console.log(`hasRootAndSubfolder: ${sunsetGroup.hasRootAndSubfolder}`);
  console.log(`maxDepth: ${sunsetGroup.maxDepth}, minDepth: ${sunsetGroup.minDepth}`);
  console.log(`directoryInsight: "${sunsetGroup.directoryInsight.text}"`);

  if (!sunsetGroup.hasRootAndSubfolder) {
    throw new Error('Expected hasRootAndSubfolder to be true for sunsetGroup');
  }
  if (sunsetGroup.maxDepth !== 3 || sunsetGroup.minDepth !== 0) {
    throw new Error(`Expected maxDepth 3 and minDepth 0, got ${sunsetGroup.maxDepth} and ${sunsetGroup.minDepth}`);
  }

  // Verify enriched file attributes
  for (const f of sunsetGroup.files) {
    console.log(`  - File [${f.id}] in ${f.location_label}: dirPath="${f.dirPath || '[ROOT]'}", depth=${f.depth}, isRoot=${f.isRoot}`);
    if (f.depth === 3 && f.id !== sunsetGroup.deepestFileId) {
      throw new Error(`Expected deepestFileId to match depth 3 file`);
    }
  }

  // Test 4: computeSmartSelection with KEEP_DEEPEST
  console.log('\n--- Test 4: Testing computeSmartSelection with KEEP_DEEPEST ---');
  const smartResult = comparator.computeSmartSelection([loc1.id, loc2.id, loc3.id], 'KEEP_DEEPEST');
  console.log(`Selected ${smartResult.totalSelectedCount} files for trashing across ${smartResult.affectedGroupsCount} groups.`);

  // In the sunset group:
  // Deepest file is in share3 (subfolder depth 3).
  // The 2 files in share1 (root) and share2 (root) must be selected!
  const rootFile1 = sunsetGroup.files.find(f => f.location_id === loc1.id);
  const rootFile2 = sunsetGroup.files.find(f => f.location_id === loc2.id);
  const deepFile = sunsetGroup.files.find(f => f.location_id === loc3.id);

  if (!smartResult.selectedFileIds.includes(rootFile1.id)) {
    throw new Error(`Expected rootFile1 (${rootFile1.id}) to be selected for trashing!`);
  }
  if (!smartResult.selectedFileIds.includes(rootFile2.id)) {
    throw new Error(`Expected rootFile2 (${rootFile2.id}) to be selected for trashing!`);
  }
  if (smartResult.selectedFileIds.includes(deepFile.id)) {
    throw new Error(`Deep file (${deepFile.id}) should NOT be selected! It should be KEPT!`);
  }
  console.log('✓ Successfully verified KEEP_DEEPEST keeps the organized project folder copy and selects loose root duplicates!');

  // Test 5: Sorting by directory using the first entry of each group
  console.log('\n--- Test 5: Testing findDuplicates with sortBy: "directory" ---');
  const sortedByDir = comparator.findDuplicates([loc1.id, loc2.id, loc3.id], { sortBy: 'directory' });
  const firstEntryDirs = sortedByDir.groups.map(g => g.files[0].dirPath || '');
  console.log('Sorted group first-entry directories:', firstEntryDirs);
  for (let i = 1; i < firstEntryDirs.length; i++) {
    if (firstEntryDirs[i - 1].localeCompare(firstEntryDirs[i]) > 0) {
      throw new Error(`Groups not sorted by first entry directory: "${firstEntryDirs[i - 1]}" came before "${firstEntryDirs[i]}"`);
    }
  }
  console.log('✓ Successfully verified duplicate groups sort by the directory of their first entry!');

  // Clean up
  dbService.closeDatabase();
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n=============================================================');
  console.log('🎉 ALL DIRECTORY COMPARISON & SMART SELECTION TESTS PASSED! 🎉');
  console.log('=============================================================');
}

runVerification().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
