const fs = require('fs');
const path = require('path');
const dbService = require('./electron/services/db');
const scanner = require('./electron/services/scanner');
const comparator = require('./electron/services/comparator');

async function verifyKeepDirectoryFeature() {
  console.log('=== VERIFYING KEEP DIRECTORY FEATURE ===\n');

  const testRoot = path.join(__dirname, 'test_sandbox_verify_keep_dir');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  const share1 = path.join(testRoot, 'Biking');
  const share2 = path.join(testRoot, 'Alpbikers');
  const dbDir = path.join(testRoot, 'db_data');

  const dir1 = path.join(share1, 'Alpbikers', '2023 Livigno', "Dag 6 foto's Bernina-Lago Bianco", 'film');
  const dir2 = path.join(share2, '2023 Livigno', "Dag 6 foto's Bernina-Lago Bianco", 'film');
  const unsorted1 = path.join(share1, 'Unsorted');
  const unsorted2 = path.join(share2, 'Unsorted');

  fs.mkdirSync(dir1, { recursive: true });
  fs.mkdirSync(dir2, { recursive: true });
  fs.mkdirSync(unsorted1, { recursive: true });
  fs.mkdirSync(unsorted2, { recursive: true });
  fs.mkdirSync(dbDir, { recursive: true });

  await dbService.initDatabase(dbDir);
  const loc1 = dbService.upsertLocation(share1, 'Biking');
  const loc2 = dbService.upsertLocation(share2, 'Alpbikers');

  const fileA = Buffer.alloc(10000, 'A');
  const fileB = Buffer.alloc(20000, 'B');
  const fileC = Buffer.alloc(30000, 'C');

  // Set 1: VID_1.insv in dir1 and dir2
  fs.writeFileSync(path.join(dir1, 'VID_1.insv'), fileA);
  fs.writeFileSync(path.join(dir2, 'VID_1.insv'), fileA);

  // Set 2: VID_2.insv in dir1 and dir2
  fs.writeFileSync(path.join(dir1, 'VID_2.insv'), fileB);
  fs.writeFileSync(path.join(dir2, 'VID_2.insv'), fileB);

  // Set 3: other.mp4 in unsorted1 and unsorted2 (outside target directory)
  fs.writeFileSync(path.join(unsorted1, 'other.mp4'), fileC);
  fs.writeFileSync(path.join(unsorted2, 'other.mp4'), fileC);

  // Scan both locations
  await scanner.scanLocation(loc1.id, share1, () => {}, true, 2, 'fresh');
  await scanner.scanLocation(loc2.id, share2, () => {}, true, 2, 'fresh');

  // Step 1: Initial state
  const initial = comparator.findDuplicates([loc1.id, loc2.id]);
  console.log(`[Step 1] Initial scan: ${initial.summary.totalGroups} duplicate groups.`);
  if (initial.summary.totalGroups !== 3) {
    throw new Error(`Expected 3 duplicate groups, got ${initial.summary.totalGroups}`);
  }

  // Step 2: Preview Keep Directory for share1 dir1
  const targetDir = "Alpbikers/2023 Livigno/Dag 6 foto's Bernina-Lago Bianco/film";
  const preview = comparator.previewKeepDirectory(loc1.id, targetDir, [loc1.id, loc2.id]);
  console.log('[Step 2] Preview result:', preview);
  if (preview.setsCount !== 2) {
    throw new Error(`Expected 2 duplicate sets in preview, got ${preview.setsCount}`);
  }
  if (preview.keptFilesCount !== 2) {
    throw new Error(`Expected 2 kept files, got ${preview.keptFilesCount}`);
  }
  if (preview.deleteFilesCount !== 2) {
    throw new Error(`Expected 2 delete files, got ${preview.deleteFilesCount}`);
  }
  if (preview.deleteBytes !== 30000) {
    throw new Error(`Expected 30000 deleteBytes (10000 + 20000), got ${preview.deleteBytes}`);
  }
  console.log('✓ previewKeepDirectory correctly identified 2 sets, 2 kept, 2 to delete (30,000 bytes).');

  // Step 3: Execute keepDirectory
  const keepResult = comparator.keepDirectory(loc1.id, targetDir, [loc1.id, loc2.id], {
    currentSelectedIds: []
  });
  console.log('[Step 3] Keep Directory execution result:', keepResult);
  if (keepResult.affectedSetsCount !== 2) {
    throw new Error(`Expected 2 affectedSetsCount, got ${keepResult.affectedSetsCount}`);
  }
  if (keepResult.selectedFileIds.length !== 2) {
    throw new Error(`Expected 2 selectedFileIds, got ${keepResult.selectedFileIds.length}`);
  }

  // Verify WHICH files were selected for deletion: they must be the files in share2 (loc2)!
  const filesSql = `SELECT id, location_id, relative_path FROM files WHERE id IN (${keepResult.selectedFileIds.join(',')})`;
  const selectedRows = dbService.queryAll(filesSql);
  for (const row of selectedRows) {
    if (row.location_id !== loc2.id) {
      throw new Error(`Expected selected file to be from share2 (locId=${loc2.id}), got locId=${row.location_id}: ${row.relative_path}`);
    }
    console.log(`  ✓ Confirmed selected file for deletion: loc=${row.location_id} path="${row.relative_path}"`);
  }

  // Verify that the files in share1 (loc1) are NOT in selectedFileIds
  const share1FilesInTarget = dbService.queryAll(
    'SELECT id, relative_path FROM files WHERE location_id = ? AND relative_path LIKE ?',
    [loc1.id, `${targetDir}/%`]
  );
  for (const f of share1FilesInTarget) {
    if (keepResult.selectedFileIds.includes(f.id)) {
      throw new Error(`File ${f.relative_path} in kept directory was wrongly marked for deletion!`);
    }
    console.log(`  ✓ Confirmed kept file is safe (not selected): "${f.relative_path}"`);
  }

  // Step 4: Test parent folder scope
  const parentDir = 'Alpbikers/2023 Livigno';
  const parentPreview = comparator.previewKeepDirectory(loc1.id, parentDir, [loc1.id, loc2.id]);
  console.log(`[Step 4] Parent directory preview for "${parentDir}": ${parentPreview.setsCount} sets.`);
  if (parentPreview.setsCount !== 2) {
    throw new Error(`Expected 2 sets for parent dir, got ${parentPreview.setsCount}`);
  }

  // Step 5: Test keeping the other direction (keep in loc2 / Alpbikers)
  const loc2Dir = "2023 Livigno/Dag 6 foto's Bernina-Lago Bianco/film";
  const loc2Keep = comparator.keepDirectory(loc2.id, loc2Dir, [loc1.id, loc2.id], {
    currentSelectedIds: []
  });
  console.log(`[Step 5] Keep in Alpbikers: selected ${loc2Keep.selectedFileIds.length} files.`);
  const loc2SelectedRows = dbService.queryAll(
    `SELECT id, location_id, relative_path FROM files WHERE id IN (${loc2Keep.selectedFileIds.join(',')})`
  );
  for (const row of loc2SelectedRows) {
    if (row.location_id !== loc1.id) {
      throw new Error(`Expected selected file to be from Biking (loc1), got loc=${row.location_id}`);
    }
  }
  console.log('✓ Successfully tested reverse direction: keeping in Alpbikers selects copies in Biking for deletion.');

  // Clean up
  dbService.closeDatabase();
  fs.rmSync(testRoot, { recursive: true, force: true });

  console.log('\n=================================================');
  console.log('✓ ALL KEEP DIRECTORY TESTS PASSED SUCCESSFULLY!');
  console.log('=================================================\n');
}

verifyKeepDirectoryFeature().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
