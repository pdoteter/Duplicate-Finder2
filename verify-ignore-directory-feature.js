const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');

async function verifyIgnoreDirectoryFeature() {
  console.log('=== VERIFYING IGNORE DIRECTORY FEATURE ===\n');

  const testRoot = path.join(__dirname, 'test_sandbox_verify_ignore_dir');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  const share1 = path.join(testRoot, 'Biking');
  const dbDir = path.join(testRoot, 'db_data');

  fs.mkdirSync(path.join(share1, 'Allerlei', '2007-06 Ventoux'), { recursive: true });
  fs.mkdirSync(path.join(share1, 'Allerlei', '2007-06 Ventoux', 'good'), { recursive: true });
  fs.mkdirSync(dbDir, { recursive: true });

  await dbService.initDatabase(dbDir);
  const loc1 = dbService.upsertLocation(share1, 'Biking');

  const fileA = Buffer.alloc(5000, 'A');
  const fileB = Buffer.alloc(6000, 'B');
  const fileC = Buffer.alloc(7000, 'C');

  // Dup Set 1: photo1.jpg in Ventoux and Ventoux/good
  fs.writeFileSync(path.join(share1, 'Allerlei', '2007-06 Ventoux', 'photo1.jpg'), fileA);
  fs.writeFileSync(path.join(share1, 'Allerlei', '2007-06 Ventoux', 'good', 'photo1.jpg'), fileA);

  // Dup Set 2: photo2.jpg in Ventoux and Ventoux/good
  fs.writeFileSync(path.join(share1, 'Allerlei', '2007-06 Ventoux', 'photo2.jpg'), fileB);
  fs.writeFileSync(path.join(share1, 'Allerlei', '2007-06 Ventoux', 'good', 'photo2.jpg'), fileB);

  // Dup Set 3: photo3.jpg in root and Ventoux
  fs.writeFileSync(path.join(share1, 'photo3.jpg'), fileC);
  fs.writeFileSync(path.join(share1, 'Allerlei', '2007-06 Ventoux', 'photo3.jpg'), fileC);

  // Scan
  await scanner.scanLocation(loc1.id, share1, () => {}, true, 2, 'fresh');

  // Step 1: Initial state
  const initial = comparator.findDuplicates([loc1.id]);
  console.log(`[Step 1] Initial scan: ${initial.summary.totalGroups} active duplicate sets, 0 ignored.`);
  if (initial.summary.totalGroups !== 3 || initial.summary.ignoredGroups !== 0) {
    throw new Error(`Expected 3 active duplicate sets and 0 ignored, got ${initial.summary.totalGroups}`);
  }

  // Step 2: Preview ignoring 'Allerlei/2007-06 Ventoux/good'
  const targetDir = 'Allerlei/2007-06 Ventoux/good';
  const preview = dbService.previewIgnoreDirectory(loc1.id, targetDir, [loc1.id]);
  console.log(`[Step 2] Preview for "${targetDir}": ${preview.setsCount} duplicate sets (${preview.filesCount} files).`);
  if (preview.setsCount !== 2 || preview.filesCount !== 2) {
    throw new Error(`Expected 2 duplicate sets in preview, got ${preview.setsCount}`);
  }

  // Step 3: Execute ignoreDirectory
  const ignoreResult = dbService.ignoreDirectory(loc1.id, targetDir, [loc1.id]);
  console.log(`[Step 3] Ignored directory result: affectedSetsCount=${ignoreResult.affectedSetsCount}`);
  if (ignoreResult.affectedSetsCount !== 2) {
    throw new Error(`Expected 2 affected sets, got ${ignoreResult.affectedSetsCount}`);
  }

  // Step 4: Verify findDuplicates output
  const afterIgnore = comparator.findDuplicates([loc1.id]);
  console.log(`[Step 4] After ignore: ${afterIgnore.summary.totalGroups} active, ${afterIgnore.summary.ignoredGroups} ignored.`);
  if (afterIgnore.summary.totalGroups !== 1 || afterIgnore.summary.ignoredGroups !== 2) {
    throw new Error(`Expected 1 active and 2 ignored groups, got active=${afterIgnore.summary.totalGroups}, ignored=${afterIgnore.summary.ignoredGroups}`);
  }
  if (!afterIgnore.ignoredDirectories || afterIgnore.ignoredDirectories.length !== 1) {
    throw new Error(`Expected 1 ignored directory in findDuplicates output, got ${JSON.stringify(afterIgnore.ignoredDirectories)}`);
  }
  console.log(`✓ Ignored directory correctly present in findDuplicates: "${afterIgnore.ignoredDirectories[0].directory_path}" (${afterIgnore.ignoredDirectories[0].sets_count} sets)`);

  // Step 5: Verify viewing IGNORED scope
  const ignoredScope = comparator.findDuplicates([loc1.id], { scope: 'IGNORED' });
  console.log(`[Step 5] IGNORED scope groups count: ${ignoredScope.groups.length}`);
  if (ignoredScope.groups.length !== 2) {
    throw new Error(`Expected 2 groups in IGNORED scope, got ${ignoredScope.groups.length}`);
  }
  for (const g of ignoredScope.groups) {
    if (!g.isIgnored) throw new Error(`Group ${g.fileName} should have isIgnored: true`);
  }

  // Step 6: Verify unignoreDirectory
  const unignoreRes = dbService.unignoreDirectory(loc1.id, targetDir);
  console.log(`[Step 6] Unignore directory result: restoredSetsCount=${unignoreRes.restoredSetsCount}`);
  const afterUnignore = comparator.findDuplicates([loc1.id]);
  if (afterUnignore.summary.totalGroups !== 3 || afterUnignore.summary.ignoredGroups !== 0) {
    throw new Error(`Expected 3 active and 0 ignored after unignore, got active=${afterUnignore.summary.totalGroups}`);
  }
  console.log('✓ Successfully unignored directory and restored all duplicate sets to active list.');

  // Step 7: Clean up test directory
  dbService.closeDatabase();
  fs.rmSync(testRoot, { recursive: true, force: true });

  console.log('\n=================================================');
  console.log('🎉 ALL IGNORE DIRECTORY FEATURE TESTS PASSED! 🎉');
  console.log('=================================================');
}

verifyIgnoreDirectoryFeature().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
