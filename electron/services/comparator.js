const path = require('path');
const dbService = require('./db');

function parseDirectoryInfo(relativePath) {
  const normalized = (relativePath || '').replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return {
      dirPath: '',
      dirSegments: [],
      depth: 0,
      isRoot: true,
      parentDir: ''
    };
  }

  const dirPath = normalized.substring(0, lastSlashIndex);
  const dirSegments = dirPath.split('/').filter(Boolean);
  const parentDir = dirSegments[dirSegments.length - 1] || '';

  return {
    dirPath,
    dirSegments,
    depth: dirSegments.length,
    isRoot: false,
    parentDir
  };
}

function getDirectoryInsight(files, locationsInvolved) {
  const rootCount = files.filter(f => f.isRoot).length;
  const subfolderCount = files.length - rootCount;
  const uniqueDirs = new Set(files.map(f => f.dirPath));
  const uniqueLocs = locationsInvolved ? locationsInvolved.length : 1;

  if (rootCount > 0 && subfolderCount > 0) {
    const deepest = files.reduce((best, f) => (f.depth > best.depth ? f : best), files[0]);
    return {
      type: 'ROOT_VS_SUBFOLDER',
      text: `${subfolderCount} copy in organized subfolder (${deepest.depth} levels deep), ${rootCount} loose in root folder`,
      badge: 'Root vs Subfolder',
      color: 'amber'
    };
  }

  if (uniqueDirs.size > 1 && uniqueLocs > 1) {
    return {
      type: 'CROSS_SHARE_DIFF_DIRS',
      text: `Copies across ${uniqueLocs} shares and ${uniqueDirs.size} different folders`,
      badge: 'Cross-Share & Folders',
      color: 'cyan'
    };
  }

  if (uniqueLocs > 1) {
    return {
      type: 'CROSS_SHARE_SAME_DIR',
      text: `Identical folder path across ${uniqueLocs} different shares`,
      badge: 'Cross-Share Duplicate',
      color: 'indigo'
    };
  }

  if (uniqueDirs.size > 1) {
    return {
      type: 'SAME_SHARE_DIFF_DIRS',
      text: `Copies in ${uniqueDirs.size} different folders on the same share`,
      badge: 'Different Folders',
      color: 'purple'
    };
  }

  return {
    type: 'SAME_DIR',
    text: `Copies in the exact same folder (duplicate or renamed copies)`,
    badge: 'Same Folder',
    color: 'slate'
  };
}

/**
 * Find duplicate files across multiple selected directories.
 * @param {number[]} locationIds 
 * @param {object} options 
 */
function findDuplicates(locationIds = [], options = {}) {
  const {
    scope = 'ALL', // 'ALL' | 'CROSS_DIRECTORY' | 'SAME_DIRECTORY'
    filterLocationId = null,
    search = '',
    minSize = 0,
    sortBy = 'wasted_space', // 'wasted_space' | 'file_size' | 'duplicate_count' | 'file_name'
    sortOrder = 'desc',
    limit = 50,
    offset = 0
  } = options;

  const targetFilterLocId = (filterLocationId !== null && filterLocationId !== undefined && filterLocationId !== '')
    ? Number(filterLocationId)
    : null;

  let activeIds = [...locationIds];
  if (!activeIds || activeIds.length === 0) {
    const locs = dbService.queryAll('SELECT id FROM locations WHERE is_active = 1');
    activeIds = locs.map(l => l.id);
  }

  if (targetFilterLocId && !activeIds.includes(targetFilterLocId)) {
    activeIds.push(targetFilterLocId);
  }

  if (activeIds.length === 0) {
    return {
      summary: {
        totalScannedFiles: 0,
        totalScannedBytes: 0,
        totalGroups: 0,
        totalDuplicateFiles: 0,
        totalWastedBytes: 0,
        crossDirectoryGroups: 0,
        sameDirectoryGroups: 0,
        crossDirectoryWastedBytes: 0,
        sameDirectoryWastedBytes: 0
      },
      groups: [],
      totalFilteredGroups: 0,
      page: 0,
      pageSize: limit
    };
  }

  const idPlaceholders = activeIds.map(() => '?').join(',');

  // Get total scanned stats across selected locations
  let scanTotalsQuery = `
    SELECT COUNT(*) as total_files, COALESCE(SUM(file_size), 0) as total_size
    FROM files
    WHERE location_id IN (${idPlaceholders})
  `;
  let scanTotalsParams = [...activeIds];
  if (targetFilterLocId) {
    scanTotalsQuery += ` AND location_id = ?`;
    scanTotalsParams.push(targetFilterLocId);
  }
  const scanTotals = dbService.queryOne(scanTotalsQuery, scanTotalsParams) || { total_files: 0, total_size: 0 };

  // Find all candidate (file_size, quick_hash) groups with > 1 copy
  let candidateQuery = `
    SELECT file_size, quick_hash, COUNT(*) as cnt, COUNT(DISTINCT location_id) as loc_cnt,
           COUNT(DISTINCT relative_path) as path_cnt,
           SUM(CASE WHEN INSTR(relative_path, '/') = 0 AND INSTR(relative_path, char(92)) = 0 THEN 1 ELSE 0 END) as root_cnt,
           MIN(file_name) as sample_name
    FROM files
    WHERE location_id IN (${idPlaceholders})
      AND quick_hash IS NOT NULL
      AND file_size > ?
    GROUP BY file_size, quick_hash
    HAVING COUNT(*) > 1
    ${targetFilterLocId ? 'AND SUM(CASE WHEN location_id = ? THEN 1 ELSE 0 END) > 0' : ''}
  `;
  const candidateParams = [...activeIds, minSize];
  if (targetFilterLocId) {
    candidateParams.push(targetFilterLocId);
  }

  const allCandidates = dbService.queryAll(candidateQuery, candidateParams);

  // Compute aggregate statistics across ALL groups
  let totalGroups = allCandidates.length;
  let totalDuplicateFiles = 0;
  let totalWastedBytes = 0;
  let crossDirectoryGroups = 0;
  let sameDirectoryGroups = 0;
  let crossDirectoryWastedBytes = 0;
  let sameDirectoryWastedBytes = 0;
  let diffFolderGroups = 0;
  let diffFolderWastedBytes = 0;
  let rootVsSubfolderGroups = 0;
  let rootVsSubfolderWastedBytes = 0;

  for (const c of allCandidates) {
    const wasted = (c.cnt - 1) * c.file_size;
    totalDuplicateFiles += (c.cnt - 1);
    totalWastedBytes += wasted;

    if (c.loc_cnt > 1) {
      crossDirectoryGroups++;
      crossDirectoryWastedBytes += wasted;
    } else {
      sameDirectoryGroups++;
      sameDirectoryWastedBytes += wasted;
    }

    if (c.path_cnt > 1) {
      diffFolderGroups++;
      diffFolderWastedBytes += wasted;
    }

    if (c.root_cnt > 0 && (c.cnt - c.root_cnt) > 0) {
      rootVsSubfolderGroups++;
      rootVsSubfolderWastedBytes += wasted;
    }
  }

  // Filter candidates by Scope
  let filtered = allCandidates;
  if (scope === 'CROSS_DIRECTORY') {
    filtered = filtered.filter(c => c.loc_cnt > 1);
  } else if (scope === 'SAME_DIRECTORY') {
    filtered = filtered.filter(c => c.loc_cnt === 1);
  } else if (scope === 'DIFF_FOLDERS') {
    filtered = filtered.filter(c => c.path_cnt > 1);
  } else if (scope === 'ROOT_VS_SUBFOLDER') {
    filtered = filtered.filter(c => c.root_cnt > 0 && (c.cnt - c.root_cnt) > 0);
  }

  // Filter by Search query
  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    // Check if sample name contains search, or query DB to see which groups contain matching files
    const matchingGroups = new Set();
    const matchingRows = dbService.queryAll(`
      SELECT DISTINCT file_size, quick_hash
      FROM files
      WHERE location_id IN (${idPlaceholders})
        AND (LOWER(file_name) LIKE ? OR LOWER(relative_path) LIKE ?)
    `, [...activeIds, `%${q}%`, `%${q}%`]);

    for (const row of matchingRows) {
      matchingGroups.add(`${row.file_size}_${row.quick_hash}`);
    }

    filtered = filtered.filter(c => matchingGroups.has(`${c.file_size}_${c.quick_hash}`));
  }

  // Sort groups
  filtered.sort((a, b) => {
    let diff = 0;
    if (sortBy === 'wasted_space') {
      const wastedA = (a.cnt - 1) * a.file_size;
      const wastedB = (b.cnt - 1) * b.file_size;
      diff = wastedB - wastedA;
    } else if (sortBy === 'file_size') {
      diff = b.file_size - a.file_size;
    } else if (sortBy === 'duplicate_count') {
      diff = b.cnt - a.cnt;
    } else if (sortBy === 'file_name') {
      diff = (a.sample_name || '').localeCompare(b.sample_name || '');
    }

    if (sortOrder === 'asc') {
      diff = -diff;
    }
    return diff;
  });

  const totalFilteredGroups = filtered.length;
  const paginatedCandidates = filtered.slice(offset, offset + limit);

  // If no candidates on this page, return early
  if (paginatedCandidates.length === 0) {
    return {
      summary: {
        totalScannedFiles: scanTotals.total_files,
        totalScannedBytes: scanTotals.total_size,
        totalGroups,
        totalDuplicateFiles,
        totalWastedBytes,
        crossDirectoryGroups,
        sameDirectoryGroups,
        crossDirectoryWastedBytes,
        sameDirectoryWastedBytes,
        diffFolderGroups,
        diffFolderWastedBytes,
        rootVsSubfolderGroups,
        rootVsSubfolderWastedBytes
      },
      groups: [],
      totalFilteredGroups,
      page: Math.floor(offset / limit),
      pageSize: limit
    };
  }

  // Fetch full file entries for the paginated candidate groups
  // Build OR condition: (file_size = ? AND quick_hash = ?)
  const conditionParts = [];
  const queryParams = [...activeIds];

  for (const c of paginatedCandidates) {
    conditionParts.push('(f.file_size = ? AND f.quick_hash = ?)');
    queryParams.push(c.file_size, c.quick_hash);
  }

  const filesSql = `
    SELECT f.id, f.location_id, f.relative_path, f.file_name, f.file_extension, f.file_size,
           f.mtime, f.quick_hash, f.full_hash,
           l.path as location_path, l.label as location_label, l.color as location_color
    FROM files f
    JOIN locations l ON f.location_id = l.id
    WHERE f.location_id IN (${idPlaceholders})
      AND (${conditionParts.join(' OR ')})
    ORDER BY f.file_size DESC, f.mtime DESC, f.id ASC
  `;

  const fileRows = dbService.queryAll(filesSql, queryParams);

  // Group files by (file_size_quick_hash)
  const groupFilesMap = new Map();
  for (const row of fileRows) {
    const key = `${row.file_size}_${row.quick_hash}`;
    if (!groupFilesMap.has(key)) {
      groupFilesMap.set(key, []);
    }
    const fullPath = path.join(row.location_path, row.relative_path);
    groupFilesMap.get(key).push({
      ...row,
      fullPath
    });
  }

  // Construct full group objects in sorted candidate order
  const finalGroups = paginatedCandidates.map((c) => {
    const key = `${c.file_size}_${c.quick_hash}`;
    const groupFiles = groupFilesMap.get(key) || [];

    // Find newest and oldest timestamp
    let maxMtime = -Infinity;
    let minMtime = Infinity;
    for (const f of groupFiles) {
      if (f.mtime > maxMtime) maxMtime = f.mtime;
      if (f.mtime < minMtime) minMtime = f.mtime;
    }

    const enrichedFiles = groupFiles.map(f => {
      const dirInfo = parseDirectoryInfo(f.relative_path);
      return {
        ...f,
        ...dirInfo,
        fullDir: path.join(f.location_path, dirInfo.dirPath),
        isNewest: groupFiles.length > 1 && f.mtime === maxMtime,
        isOldest: groupFiles.length > 1 && f.mtime === minMtime
      };
    });

    const locIds = Array.from(new Set(groupFiles.map(f => f.location_id)));

    // Find deepest and shallowest file in group
    let deepestFile = enrichedFiles[0];
    let shallowestFile = enrichedFiles[0];
    let maxDepth = -1;
    let minDepth = Infinity;

    for (const f of enrichedFiles) {
      if (f.depth > maxDepth || (f.depth === maxDepth && f.mtime > (deepestFile ? deepestFile.mtime : -Infinity))) {
        maxDepth = f.depth;
        deepestFile = f;
      }
      if (f.depth < minDepth || (f.depth === minDepth && f.mtime < (shallowestFile ? shallowestFile.mtime : Infinity))) {
        minDepth = f.depth;
        shallowestFile = f;
      }
    }

    const uniqueDirsCount = new Set(enrichedFiles.map(f => f.dirPath)).size;
    const hasDifferentDirs = uniqueDirsCount > 1;
    const hasRootAndSubfolder = enrichedFiles.some(f => f.isRoot) && enrichedFiles.some(f => !f.isRoot);
    const directoryInsight = getDirectoryInsight(enrichedFiles, locIds);

    return {
      groupId: key,
      fileSize: c.file_size,
      quickHash: c.quick_hash,
      fileName: c.sample_name || (groupFiles[0] ? groupFiles[0].file_name : 'unknown'),
      fileCount: groupFiles.length,
      wastedBytes: Math.max(0, (groupFiles.length - 1) * c.file_size),
      isCrossDirectory: c.loc_cnt > 1,
      locationsInvolved: locIds,
      hasDifferentDirs,
      hasRootAndSubfolder,
      uniqueDirsCount,
      maxDepth,
      minDepth,
      deepestFileId: deepestFile ? deepestFile.id : null,
      shallowestFileId: shallowestFile ? shallowestFile.id : null,
      directoryInsight,
      files: enrichedFiles
    };
  });

  return {
    summary: {
      totalScannedFiles: scanTotals.total_files,
      totalScannedBytes: scanTotals.total_size,
      totalGroups,
      totalDuplicateFiles,
      totalWastedBytes,
      crossDirectoryGroups,
      sameDirectoryGroups,
      crossDirectoryWastedBytes,
      sameDirectoryWastedBytes,
      diffFolderGroups,
      diffFolderWastedBytes,
      rootVsSubfolderGroups,
      rootVsSubfolderWastedBytes
    },
    groups: finalGroups,
    totalFilteredGroups,
    page: Math.floor(offset / limit),
    pageSize: limit
  };
}

/**
 * Get files that are UNIQUE to a specific directory (i.e. content does not exist in any other share).
 * @param {number} targetLocationId 
 * @param {number[]} compareLocationIds 
 * @param {object} options 
 */
function getUniqueFiles(targetLocationId, compareLocationIds = [], options = {}) {
  const {
    search = '',
    sortBy = 'size', // 'size' | 'name' | 'mtime'
    sortOrder = 'desc',
    limit = 50,
    offset = 0
  } = options;

  let compIds = compareLocationIds;
  if (!compIds || compIds.length === 0) {
    const otherLocs = dbService.queryAll('SELECT id FROM locations WHERE id != ? AND is_active = 1', [targetLocationId]);
    compIds = otherLocs.map(l => l.id);
  }

  // If no other locations exist to compare against, all files in target are trivially unique
  let notExistsClause = '';
  const queryParams = [targetLocationId];

  if (compIds.length > 0) {
    const otherPlaceholders = compIds.map(() => '?').join(',');
    notExistsClause = `
      AND NOT EXISTS (
        SELECT 1 FROM files other
        WHERE other.location_id IN (${otherPlaceholders})
          AND other.file_size = f.file_size
          AND other.quick_hash = f.quick_hash
      )
    `;
    queryParams.push(...compIds);
  }

  // Check search filter
  let searchClause = '';
  if (search && search.trim() !== '') {
    searchClause = ' AND (LOWER(f.file_name) LIKE ? OR LOWER(f.relative_path) LIKE ?)';
    queryParams.push(`%${search.trim().toLowerCase()}%`, `%${search.trim().toLowerCase()}%`);
  }

  // Summary counts
  const countSql = `
    SELECT COUNT(*) as total_count, COALESCE(SUM(f.file_size), 0) as total_size
    FROM files f
    WHERE f.location_id = ?
      ${notExistsClause}
      ${searchClause}
  `;
  const summary = dbService.queryOne(countSql, queryParams) || { total_count: 0, total_size: 0 };

  // Sorting
  let orderColumn = 'f.file_size';
  if (sortBy === 'name') orderColumn = 'f.file_name';
  if (sortBy === 'mtime') orderColumn = 'f.mtime';
  const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Paginated query
  const filesSql = `
    SELECT f.id, f.location_id, f.relative_path, f.file_name, f.file_extension, f.file_size,
           f.mtime, f.quick_hash,
           l.path as location_path, l.label as location_label, l.color as location_color
    FROM files f
    JOIN locations l ON f.location_id = l.id
    WHERE f.location_id = ?
      ${notExistsClause}
      ${searchClause}
    ORDER BY ${orderColumn} ${orderDirection}
    LIMIT ? OFFSET ?
  `;

  const filesParams = [...queryParams, limit, offset];
  const rows = dbService.queryAll(filesSql, filesParams);

  const files = rows.map(r => ({
    ...r,
    fullPath: path.join(r.location_path, r.relative_path)
  }));

  return {
    summary: {
      totalUniqueFiles: summary.total_count,
      totalUniqueBytes: summary.total_size
    },
    files,
    totalCount: summary.total_count,
    page: Math.floor(offset / limit),
    pageSize: limit
  };
}

/**
 * Get comprehensive storage breakdown and duplicate statistics per location.
 * @param {number[]} locationIds 
 */
function getLocationsStats(locationIds = []) {
  let activeIds = locationIds;
  if (!activeIds || activeIds.length === 0) {
    const locs = dbService.queryAll('SELECT id FROM locations');
    activeIds = locs.map(l => l.id);
  }

  if (activeIds.length === 0) return [];

  const idPlaceholders = activeIds.map(() => '?').join(',');

  // Get base locations
  const locations = dbService.queryAll(
    `SELECT * FROM locations WHERE id IN (${idPlaceholders}) ORDER BY id ASC`,
    activeIds
  );

  // Compute duplicate files count and duplicate bytes per location
  // A file is considered a duplicate if its (file_size, quick_hash) exists more than once across active locations
  const dupStats = dbService.queryAll(`
    SELECT f.location_id, COUNT(*) as duplicate_files, COALESCE(SUM(f.file_size), 0) as duplicate_bytes
    FROM files f
    WHERE f.location_id IN (${idPlaceholders})
      AND EXISTS (
        SELECT 1 FROM files f2
        WHERE f2.location_id IN (${idPlaceholders})
          AND f2.id != f.id
          AND f2.file_size = f.file_size
          AND f2.quick_hash = f.quick_hash
      )
    GROUP BY f.location_id
  `, [...activeIds, ...activeIds]);

  const dupMap = new Map();
  for (const s of dupStats) {
    dupMap.set(s.location_id, s);
  }

  return locations.map(loc => {
    const dup = dupMap.get(loc.id) || { duplicate_files: 0, duplicate_bytes: 0 };
    const uniqueFiles = Math.max(0, loc.total_files - dup.duplicate_files);
    const uniqueBytes = Math.max(0, loc.total_size - dup.duplicate_bytes);

    return {
      id: loc.id,
      path: loc.path,
      label: loc.label || loc.path,
      color: loc.color,
      isActive: Boolean(loc.is_active),
      lastScannedAt: loc.last_scanned_at,
      totalFiles: loc.total_files,
      totalBytes: loc.total_size,
      duplicateFiles: dup.duplicate_files,
      duplicateBytes: dup.duplicate_bytes,
      uniqueFiles,
      uniqueBytes,
      duplicatePercentage: loc.total_size > 0 ? ((dup.duplicate_bytes / loc.total_size) * 100).toFixed(1) : 0
    };
  });
}

/**
 * Compute smart file selection for deletion across ALL duplicate candidate groups in SQLite.
 * Executes in < 1 second even across 50,000+ duplicate groups.
 * @param {number[]} locationIds
 * @param {string} ruleType 'KEEP_DEEPEST' | 'KEEP_SHALLOWEST' | 'KEEP_NEWEST' | 'KEEP_OLDEST' | 'KEEP_LOCATION' | 'KEEP_FIRST' | 'KEEP_SECOND' | 'INVERT'
 * @param {object} options
 */
function computeSmartSelection(locationIds = [], ruleType = 'KEEP_DEEPEST', options = {}) {
  const {
    targetLocationId = null,
    filterLocationId = null,
    scope = 'ALL',
    search = '',
    minSize = 0,
    currentSelectedIds = []
  } = options;

  const currentSelectedSet = new Set((currentSelectedIds || []).map(Number));

  const targetFilterLocId = (filterLocationId !== null && filterLocationId !== undefined && filterLocationId !== '')
    ? Number(filterLocationId)
    : null;

  let activeIds = [...locationIds];
  if (!activeIds || activeIds.length === 0) {
    const locs = dbService.queryAll('SELECT id FROM locations WHERE is_active = 1');
    activeIds = locs.map(l => l.id);
  }

  if (targetFilterLocId && !activeIds.includes(targetFilterLocId)) {
    activeIds.push(targetFilterLocId);
  }

  if (activeIds.length === 0) {
    return {
      selectedFileIds: [],
      totalSelectedCount: 0,
      totalSelectedBytes: 0,
      affectedGroupsCount: 0
    };
  }

  const idPlaceholders = activeIds.map(() => '?').join(',');

  // Get all candidate groups
  const candSql = `
    SELECT file_size, quick_hash, COUNT(*) as cnt, COUNT(DISTINCT location_id) as loc_cnt,
           COUNT(DISTINCT relative_path) as path_cnt,
           SUM(CASE WHEN INSTR(relative_path, '/') = 0 AND INSTR(relative_path, char(92)) = 0 THEN 1 ELSE 0 END) as root_cnt
    FROM files
    WHERE location_id IN (${idPlaceholders})
      AND quick_hash IS NOT NULL
      AND file_size > ?
    GROUP BY file_size, quick_hash
    HAVING COUNT(*) > 1
    ${targetFilterLocId ? 'AND SUM(CASE WHEN location_id = ? THEN 1 ELSE 0 END) > 0' : ''}
  `;
  const candParams = [...activeIds, minSize];
  if (targetFilterLocId) {
    candParams.push(targetFilterLocId);
  }
  const candidates = dbService.queryAll(candSql, candParams);

  // Filter candidates by Scope
  let filtered = candidates;
  if (scope === 'CROSS_DIRECTORY') {
    filtered = filtered.filter(c => c.loc_cnt > 1);
  } else if (scope === 'SAME_DIRECTORY') {
    filtered = filtered.filter(c => c.loc_cnt === 1);
  } else if (scope === 'DIFF_FOLDERS') {
    filtered = filtered.filter(c => c.path_cnt > 1);
  } else if (scope === 'ROOT_VS_SUBFOLDER') {
    filtered = filtered.filter(c => c.root_cnt > 0 && (c.cnt - c.root_cnt) > 0);
  }

  // Filter by Search if specified
  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    const matchingRows = dbService.queryAll(`
      SELECT DISTINCT file_size, quick_hash
      FROM files
      WHERE location_id IN (${idPlaceholders})
        AND (LOWER(file_name) LIKE ? OR LOWER(relative_path) LIKE ?)
    `, [...activeIds, `%${q}%`, `%${q}%`]);
    const matchingSet = new Set(matchingRows.map(r => `${r.file_size}_${r.quick_hash}`));
    filtered = filtered.filter(c => matchingSet.has(`${c.file_size}_${c.quick_hash}`));
  }

  if (filtered.length === 0) {
    return {
      selectedFileIds: [],
      totalSelectedCount: 0,
      totalSelectedBytes: 0,
      affectedGroupsCount: 0
    };
  }

  // Build candidate set for fast lookup
  const candidateKeys = new Set(filtered.map(c => `${c.file_size}_${c.quick_hash}`));

  // Fetch all duplicate files matching active locations in the exact same order as findDuplicates
  const filesSql = `
    WITH dup_keys AS (
      SELECT file_size, quick_hash
      FROM files
      WHERE location_id IN (${idPlaceholders})
        AND quick_hash IS NOT NULL
        AND file_size > ?
      GROUP BY file_size, quick_hash
      HAVING COUNT(*) > 1
    )
    SELECT f.id, f.location_id, f.relative_path, f.file_size, f.quick_hash, f.mtime
    FROM files f
    JOIN dup_keys dk ON f.file_size = dk.file_size AND f.quick_hash = dk.quick_hash
    WHERE f.location_id IN (${idPlaceholders})
    ORDER BY f.file_size DESC, f.mtime DESC, f.id ASC
  `;
  const allDupFiles = dbService.queryAll(filesSql, [...activeIds, minSize, ...activeIds]);

  // Group files
  const groupsMap = new Map();
  for (const f of allDupFiles) {
    const key = `${f.file_size}_${f.quick_hash}`;
    if (!candidateKeys.has(key)) continue;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(f);
  }

  const selectedFileIds = [];
  let totalSelectedBytes = 0;
  let affectedGroupsCount = 0;

  for (const [key, files] of groupsMap) {
    if (files.length <= 1) continue;

    if (ruleType === 'INVERT') {
      const hasSelectedInGroup = files.some(f => currentSelectedSet.has(f.id));
      if (hasSelectedInGroup) {
        let invertedAny = false;
        for (const f of files) {
          if (!currentSelectedSet.has(f.id)) {
            selectedFileIds.push(f.id);
            totalSelectedBytes += f.file_size;
            invertedAny = true;
          }
        }
        if (invertedAny || hasSelectedInGroup) {
          affectedGroupsCount++;
        }
      }
      continue;
    }

    let keptFile = null;

    if (ruleType === 'KEEP_DEEPEST') {
      let maxDepth = -1;
      for (const f of files) {
        const depth = (f.relative_path.match(/[/\\]/g) || []).length;
        if (depth > maxDepth || (depth === maxDepth && f.mtime > (keptFile ? keptFile.mtime : -Infinity))) {
          maxDepth = depth;
          keptFile = f;
        }
      }
    } else if (ruleType === 'KEEP_SHALLOWEST') {
      let minDepth = Infinity;
      for (const f of files) {
        const depth = (f.relative_path.match(/[/\\]/g) || []).length;
        if (depth < minDepth || (depth === minDepth && f.mtime > (keptFile ? keptFile.mtime : -Infinity))) {
          minDepth = depth;
          keptFile = f;
        }
      }
    } else if (ruleType === 'KEEP_NEWEST') {
      let maxMtime = -Infinity;
      for (const f of files) {
        if (f.mtime > maxMtime) {
          maxMtime = f.mtime;
          keptFile = f;
        }
      }
    } else if (ruleType === 'KEEP_OLDEST') {
      let minMtime = Infinity;
      for (const f of files) {
        if (f.mtime < minMtime) {
          minMtime = f.mtime;
          keptFile = f;
        }
      }
    } else if (ruleType === 'KEEP_LOCATION' && targetLocationId) {
      const inTarget = files.filter(f => f.location_id === Number(targetLocationId));
      if (inTarget.length > 0) {
        keptFile = inTarget.reduce((best, f) => {
          const depthF = (f.relative_path.match(/[/\\]/g) || []).length;
          const depthB = (best.relative_path.match(/[/\\]/g) || []).length;
          if (depthF > depthB) return f;
          if (depthF === depthB && f.mtime > best.mtime) return f;
          return best;
        }, inTarget[0]);
      }
    } else if (ruleType === 'KEEP_OTHER_LOCATIONS' && targetLocationId) {
      const targetId = Number(targetLocationId);
      const outsideTarget = files.filter(f => f.location_id !== targetId);
      if (outsideTarget.length > 0) {
        keptFile = outsideTarget.reduce((best, f) => {
          const depthF = (f.relative_path.match(/[/\\]/g) || []).length;
          const depthB = (best.relative_path.match(/[/\\]/g) || []).length;
          if (depthF > depthB) return f;
          if (depthF === depthB && f.mtime > best.mtime) return f;
          return best;
        }, outsideTarget[0]);
      } else {
        // If all copies in group are in target location, keep deepest/newest to avoid deleting all copies
        keptFile = files.reduce((best, f) => {
          const depthF = (f.relative_path.match(/[/\\]/g) || []).length;
          const depthB = (best.relative_path.match(/[/\\]/g) || []).length;
          if (depthF > depthB) return f;
          if (depthF === depthB && f.mtime > best.mtime) return f;
          return best;
        }, files[0]);
      }
    } else if (ruleType === 'KEEP_FIRST') {
      keptFile = files[0];
    } else if (ruleType === 'KEEP_SECOND') {
      keptFile = files[1] || files[0];
    }

    if (keptFile) {
      let hasSelectedInGroup = false;
      for (const f of files) {
        if (f.id !== keptFile.id) {
          selectedFileIds.push(f.id);
          totalSelectedBytes += f.file_size;
          hasSelectedInGroup = true;
        }
      }
      if (hasSelectedInGroup) {
        affectedGroupsCount++;
      }
    }
  }

  return {
    selectedFileIds,
    totalSelectedCount: selectedFileIds.length,
    totalSelectedBytes,
    affectedGroupsCount
  };
}

module.exports = {
  findDuplicates,
  getUniqueFiles,
  getLocationsStats,
  computeSmartSelection,
  parseDirectoryInfo,
  getDirectoryInsight
};

