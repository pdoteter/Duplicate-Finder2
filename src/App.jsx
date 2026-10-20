import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import DuplicateSummaryBar from './components/DuplicateSummaryBar';
import DuplicateGroupsList from './components/DuplicateGroupsList';
import UniqueFilesView from './components/UniqueFilesView';
import ShareStatsView from './components/ShareStatsView';
import ScanModal from './components/ScanModal';
import ScanChoiceModal from './components/ScanChoiceModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import ExcludedExtensionsModal from './components/ExcludedExtensionsModal';
import { formatBytes } from './utils/formatters';

export default function App() {
  const [locations, setLocations] = useState([]);
  const [activeLocationIds, setActiveLocationIds] = useState([]);
  const [activeTab, setActiveTab] = useState('DUPLICATES'); // 'DUPLICATES' | 'UNIQUE' | 'STATS'

  // Duplicates state
  const [activeScope, setActiveScope] = useState('ALL'); // 'ALL' | 'CROSS_DIRECTORY' | 'SAME_DIRECTORY'
  const [filterLocationId, setFilterLocationId] = useState(null); // Filter duplicate groups by specific share/location
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('wasted_space');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [duplicateData, setDuplicateData] = useState({
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
    pageSize: 50
  });

  // Selected files for batch operations
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());

  // Location stats for Stats tab
  const [statsData, setStatsData] = useState([]);

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanThreads, setScanThreads] = useState(4);

  // Scan Choice Modal State (Resume vs Fresh Rescan)
  const [isScanChoiceOpen, setIsScanChoiceOpen] = useState(false);
  const [scanChoiceTarget, setScanChoiceTarget] = useState(null);

  // Deletion Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Excluded Extensions State
  const [excludedExtensions, setExcludedExtensions] = useState(['xmp']);
  const [isExclusionsModalOpen, setIsExclusionsModalOpen] = useState(false);

  // Load locations on start
  const loadLocations = useCallback(async () => {
    if (!window.api) return;
    try {
      const locs = await window.api.getLocations();
      setLocations(locs);

      // Default active to all enabled locations
      setActiveLocationIds(prev => {
        if (prev.length === 0) {
          return locs.filter(l => l.is_active !== 0).map(l => l.id);
        }
        // Preserve active IDs that still exist
        const validIds = prev.filter(id => locs.some(l => l.id === id));
        return validIds.length > 0 ? validIds : locs.map(l => l.id);
      });
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  }, []);

  const loadExclusions = useCallback(async () => {
    if (!window.api?.getExcludedExtensions) return;
    try {
      const exts = await window.api.getExcludedExtensions();
      if (Array.isArray(exts)) {
        setExcludedExtensions(exts);
      }
    } catch (err) {
      console.error('Failed to load excluded extensions:', err);
    }
  }, []);

  useEffect(() => {
    loadLocations();
    loadExclusions();
  }, [loadLocations, loadExclusions]);

  // Fetch duplicates
  const refreshDuplicates = useCallback(async (pageOverride = null) => {
    const targetPage = typeof pageOverride === 'number' ? pageOverride : page;
    if (!window.api || activeLocationIds.length === 0) {
      setDuplicateData({
        summary: {
          totalScannedFiles: 0,
          totalScannedBytes: 0,
          totalGroups: 0,
          totalDuplicateFiles: 0,
          totalWastedBytes: 0,
          crossDirectoryGroups: 0,
          sameDirectoryGroups: 0
        },
        groups: [],
        totalFilteredGroups: 0,
        page: 0,
        pageSize
      });
      return;
    }

    try {
      const result = await window.api.findDuplicates(activeLocationIds, {
        scope: activeScope,
        filterLocationId,
        search: searchQuery,
        sortBy,
        limit: pageSize,
        offset: targetPage * pageSize
      });
      setDuplicateData(result);
    } catch (err) {
      console.error('Failed to find duplicates:', err);
    }
  }, [activeLocationIds, activeScope, filterLocationId, searchQuery, sortBy, page, pageSize]);

  // Fetch stats for all locations
  const refreshStats = useCallback(async () => {
    if (!window.api || locations.length === 0) return;
    try {
      const allIds = locations.map(l => l.id);
      const res = await window.api.getLocationsStats(allIds);
      setStatsData(res);
    } catch (err) {
      console.error('Failed to get stats:', err);
    }
  }, [locations]);

  // Listen to scan progress events
  useEffect(() => {
    if (!window.api) return;
    const unsubscribe = window.api.onScanProgress((data) => {
      setScanProgress(data);
      if (data.completed) {
        setIsScanning(false);
        setScanProgress(null);
        setPage(0);
        loadLocations();
        refreshDuplicates(0);
        refreshStats();
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [loadLocations, refreshDuplicates, refreshStats]);

  useEffect(() => {
    refreshDuplicates();
  }, [refreshDuplicates]);

  useEffect(() => {
    if (activeTab === 'STATS') {
      refreshStats();
    }
  }, [activeTab, refreshStats]);

  // Handlers for Location Management
  const handleToggleLocation = async (locationId, isChecked) => {
    setActiveLocationIds(prev => {
      const next = isChecked ? [...prev, locationId] : prev.filter(id => id !== locationId);
      return next;
    });
    setPage(0);
    setSelectedFileIds(new Set());
  };

  const handleAddLocation = async () => {
    if (!window.api) return;
    const folderPath = await window.api.selectFolder('Select Network Share or Directory to Compare');
    if (!folderPath) return;

    try {
      const newLoc = await window.api.upsertLocation(folderPath);
      await loadLocations();

      if (!activeLocationIds.includes(newLoc.id)) {
        setActiveLocationIds(prev => [...prev, newLoc.id]);
      }

      if (confirm(`Would you like to index "${folderPath}" now?`)) {
        handleScanLocation(newLoc.id);
      }
    } catch (err) {
      alert(`Failed to add location: ${err.message}`);
    }
  };

  const handleRemoveLocation = async (locationId) => {
    const loc = locations.find(l => l.id === locationId);
    const name = loc ? (loc.label || loc.path) : 'this directory';
    if (!confirm(`Remove "${name}" from the duplicate finder? (Your actual files will NOT be touched)`)) {
      return;
    }

    await window.api.removeLocation(locationId);
    setActiveLocationIds(prev => prev.filter(id => id !== locationId));
    if (filterLocationId === locationId) {
      setFilterLocationId(null);
    }
    setPage(0);
    setSelectedFileIds(new Set());
    await loadLocations();
  };

  const handleFilterLocationDuplicates = (locationId) => {
    if (locationId && !activeLocationIds.includes(locationId)) {
      setActiveLocationIds(prev => [...prev, locationId]);
    }
    setFilterLocationId(locationId);
    setActiveTab('DUPLICATES');
    setPage(0);
  };

  const executeScanLocation = async (locationId, scanMode = 'resume') => {
    if (!window.api || isScanning) return;
    setIsScanning(true);
    setScanProgress({ 
      totalFiles: 0, 
      totalBytes: 0, 
      currentDir: 'Initializing scanner...', 
      activeThreads: scanThreads,
      resumed: scanMode === 'resume'
    });
    try {
      await window.api.startScan(locationId, true, scanThreads, scanMode);
    } catch (err) {
      alert(`Scan failed: ${err.message}`);
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const executeScanAll = async (scanMode = 'resume') => {
    if (!window.api || isScanning || activeLocationIds.length === 0) return;
    setIsScanning(true);
    setScanProgress({
      multiScan: true,
      currentIndex: 0,
      totalLocations: activeLocationIds.length,
      totalFiles: 0,
      totalBytes: 0,
      currentDir: 'Starting batch scan...',
      activeThreads: scanThreads,
      resumed: scanMode === 'resume'
    });
    try {
      await window.api.startScanAll(activeLocationIds, true, scanThreads, scanMode);
    } catch (err) {
      alert(`Batch scan failed: ${err.message}`);
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const handleScanLocation = (locationId) => {
    if (!window.api || isScanning) return;
    const loc = locations.find(l => l.id === locationId);
    if (!loc) return;

    if (loc.total_files > 0) {
      setScanChoiceTarget({
        isBatch: false,
        location: loc,
        totalIndexedFiles: loc.total_files,
        totalIndexedBytes: loc.total_size,
        scan_status: loc.scan_status
      });
      setIsScanChoiceOpen(true);
    } else {
      executeScanLocation(locationId, 'fresh');
    }
  };

  const handleScanAll = () => {
    if (!window.api || isScanning || activeLocationIds.length === 0) return;
    const activeLocs = locations.filter(l => activeLocationIds.includes(l.id));
    const hasExisting = activeLocs.some(l => (l.total_files || 0) > 0);

    if (hasExisting) {
      const totalIndexedFiles = activeLocs.reduce((acc, l) => acc + (l.total_files || 0), 0);
      const totalIndexedBytes = activeLocs.reduce((acc, l) => acc + (l.total_size || 0), 0);
      setScanChoiceTarget({
        isBatch: true,
        locationCount: activeLocs.length,
        totalIndexedFiles,
        totalIndexedBytes,
        scan_status: activeLocs.some(l => l.scan_status === 'cancelled') ? 'cancelled' : 'completed'
      });
      setIsScanChoiceOpen(true);
    } else {
      executeScanAll('fresh');
    }
  };

  const handleChoiceResume = () => {
    setIsScanChoiceOpen(false);
    if (!scanChoiceTarget) return;
    if (scanChoiceTarget.isBatch) {
      executeScanAll('resume');
    } else {
      executeScanLocation(scanChoiceTarget.location.id, 'resume');
    }
  };

  const handleChoiceFresh = () => {
    setIsScanChoiceOpen(false);
    if (!scanChoiceTarget) return;
    if (scanChoiceTarget.isBatch) {
      executeScanAll('fresh');
    } else {
      executeScanLocation(scanChoiceTarget.location.id, 'fresh');
    }
  };

  const handleCancelScan = async () => {
    if (!window.api) return;
    await window.api.cancelScan();
  };

  // Selection handlers
  const handleToggleFileSelection = (fileId, isChecked) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (isChecked) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  };

  const handleApplySmartSelection = async (type, targetLocationId = null, targetScope = 'ALL') => {
    if (type === 'INVERT' && selectedFileIds.size === 0) {
      alert('No files are currently selected to invert. Please select files or apply a Smart Select rule first.');
      return;
    }

    if (targetScope === 'ALL' && window.api?.computeSmartSelection) {
      try {
        const res = await window.api.computeSmartSelection(activeLocationIds, type, {
          targetLocationId,
          filterLocationId,
          scope: activeScope,
          search: searchQuery,
          currentSelectedIds: Array.from(selectedFileIds)
        });
        setSelectedFileIds(new Set(res.selectedFileIds));
        alert(
          `${type === 'INVERT' ? 'Selection Inverted' : 'Smart Selection Applied'} Across ALL Sets!\n\n` +
          `• Selected: ${res.totalSelectedCount.toLocaleString()} duplicate files for deletion\n` +
          `• Recoverable Storage: ${formatBytes(res.totalSelectedBytes)}\n` +
          `• Duplicate Sets Processed: ${res.affectedGroupsCount.toLocaleString()}`
        );
      } catch (err) {
        alert(`Failed to apply smart selection: ${err.message}`);
      }
      return;
    }

    // Page-only fallback
    const nextSelected = new Set(selectedFileIds);

    for (const group of duplicateData.groups) {
      const files = group.files;
      if (files.length <= 1) continue;

      if (type === 'INVERT') {
        const hasSelectionInGroup = files.some(f => selectedFileIds.has(f.id));
        if (hasSelectionInGroup) {
          files.forEach(f => {
            if (selectedFileIds.has(f.id)) {
              nextSelected.delete(f.id);
            } else {
              nextSelected.add(f.id);
            }
          });
        }
        continue;
      }

      let keptFile = null;

      if (type === 'KEEP_DEEPEST') {
        let maxDepth = -1;
        for (const f of files) {
          if (f.depth > maxDepth || (f.depth === maxDepth && f.mtime > (keptFile ? keptFile.mtime : -Infinity))) {
            maxDepth = f.depth;
            keptFile = f;
          }
        }
      } else if (type === 'KEEP_SHALLOWEST') {
        let minDepth = Infinity;
        for (const f of files) {
          if (f.depth < minDepth || (f.depth === minDepth && f.mtime > (keptFile ? keptFile.mtime : -Infinity))) {
            minDepth = f.depth;
            keptFile = f;
          }
        }
      } else if (type === 'KEEP_NEWEST') {
        let maxMtime = -Infinity;
        for (const f of files) {
          if (f.mtime > maxMtime) {
            maxMtime = f.mtime;
            keptFile = f;
          }
        }
      } else if (type === 'KEEP_OLDEST') {
        let minMtime = Infinity;
        for (const f of files) {
          if (f.mtime < minMtime) {
            minMtime = f.mtime;
            keptFile = f;
          }
        }
      } else if (type === 'KEEP_FIRST') {
        keptFile = files[0];
      } else if (type === 'KEEP_SECOND') {
        keptFile = files[1] || files[0];
      } else if (type === 'KEEP_LOCATION' && targetLocationId) {
        const inTarget = files.filter(f => f.location_id === targetLocationId);
        if (inTarget.length > 0) {
          keptFile = inTarget.reduce((b, f) => ((f.depth || 0) > (b.depth || 0) || ((f.depth || 0) === (b.depth || 0) && f.mtime > b.mtime) ? f : b), inTarget[0]);
        }
      } else if (type === 'KEEP_OTHER_LOCATIONS' && targetLocationId) {
        const outsideTarget = files.filter(f => f.location_id !== targetLocationId);
        if (outsideTarget.length > 0) {
          keptFile = outsideTarget.reduce((b, f) => ((f.depth || 0) > (b.depth || 0) || ((f.depth || 0) === (b.depth || 0) && f.mtime > b.mtime) ? f : b), outsideTarget[0]);
        } else {
          keptFile = files.reduce((b, f) => ((f.depth || 0) > (b.depth || 0) || ((f.depth || 0) === (b.depth || 0) && f.mtime > b.mtime) ? f : b), files[0]);
        }
      }

      if (keptFile) {
        files.forEach(f => {
          if (f.id === keptFile.id) {
            nextSelected.delete(f.id);
          } else {
            nextSelected.add(f.id);
          }
        });
      }
    }

    setSelectedFileIds(nextSelected);
  };

  const handleClearSelection = () => {
    setSelectedFileIds(new Set());
  };

  // Deletion execution
  const handleDeleteBatch = async (options) => {
    if (!window.api || selectedFileIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedFileIds);
      const res = await window.api.deleteBatchFiles(ids, options);
      setIsDeleteModalOpen(false);

      if (res.errors && res.errors.length > 0) {
        const actionLabel = options.action === 'quarantine' ? 'quarantine' : 'delete';
        alert(`Successfully processed ${res.deletedCount} files (${formatBytes(res.reclaimedBytes)} reclaimed).\n\n${res.errors.length} files failed to ${actionLabel}:\n${res.errors.map(e => e.error).slice(0, 3).join('\n')}`);
      }

      setSelectedFileIds(new Set());
      setPage(0);
      await refreshDuplicates(0);
      await loadLocations();
      await refreshStats();
    } catch (err) {
      alert(`Operation error: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingleFile = (fileId) => {
    setSelectedFileIds(new Set([fileId]));
    setIsDeleteModalOpen(true);
  };

  const handleRevealExplorer = (filePath) => {
    if (window.api) window.api.revealInExplorer(filePath);
  };

  const handleOpenFile = (filePath) => {
    if (window.api) window.api.openFile(filePath);
  };

  const handleSaveExclusions = async (nextExtensions) => {
    if (!window.api?.setExcludedExtensions) return null;
    try {
      const res = await window.api.setExcludedExtensions(nextExtensions);
      if (res && Array.isArray(res.excludedExtensions)) {
        setExcludedExtensions(res.excludedExtensions);
      }
      setSelectedFileIds(new Set());
      setPage(0);
      await loadLocations();
      await refreshDuplicates(0);
      await refreshStats();
      return res;
    } catch (err) {
      alert(`Failed to update excluded extensions: ${err.message}`);
      return null;
    }
  };

  const handleQuickExcludeExtension = async (ext) => {
    if (!ext) return;
    const normalized = String(ext).trim().toLowerCase().replace(/^\./, '');
    if (!normalized) return;
    const nextList = Array.from(new Set([...excludedExtensions, normalized]));
    await handleSaveExclusions(nextList);
  };

  // Ignored Sets Handlers
  const handleIgnoreSet = async (group) => {
    if (!window.api?.ignoreSet || !group) return;
    try {
      await window.api.ignoreSet(group.fileSize, group.quickHash, group.fileName);
      // Deselect any files in this group so they cannot be accidentally deleted
      if (group.files && group.files.length > 0) {
        setSelectedFileIds(prev => {
          const next = new Set(prev);
          for (const f of group.files) {
            next.delete(f.id);
          }
          return next;
        });
      }
      await refreshDuplicates();
      if (activeTab === 'STATS') {
        await refreshStats();
      }
    } catch (err) {
      alert(`Failed to ignore set: ${err.message}`);
    }
  };

  const handleUnignoreSet = async (group) => {
    if (!window.api?.unignoreSet || !group) return;
    try {
      await window.api.unignoreSet(group.fileSize, group.quickHash);
      await refreshDuplicates();
      if (activeTab === 'STATS') {
        await refreshStats();
      }
    } catch (err) {
      alert(`Failed to unignore set: ${err.message}`);
    }
  };

  const handleClearIgnoredSets = async () => {
    if (!window.api?.clearIgnoredSets) return;
    try {
      await window.api.clearIgnoredSets();
      if (activeScope === 'IGNORED') {
        setActiveScope('ALL');
      }
      setPage(0);
      await refreshDuplicates(0);
      if (activeTab === 'STATS') {
        await refreshStats();
      }
    } catch (err) {
      alert(`Failed to restore ignored sets: ${err.message}`);
    }
  };

  // Calculate selected files volume and involved locations
  const selectedStats = useMemo(() => {
    let bytes = 0;
    const locationIds = new Set();
    for (const group of duplicateData.groups) {
      for (const f of group.files) {
        if (selectedFileIds.has(f.id)) {
          bytes += f.file_size;
          if (f.location_id) locationIds.add(f.location_id);
        }
      }
    }
    const involved = locations.filter(l => locationIds.has(l.id));
    return {
      count: selectedFileIds.size,
      bytes,
      locations: involved
    };
  }, [duplicateData.groups, selectedFileIds, locations]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans select-none">
      {/* Header */}
      <Header
        locations={locations}
        activeLocationIds={activeLocationIds}
        onToggleLocation={handleToggleLocation}
        onAddLocation={handleAddLocation}
        onRemoveLocation={handleRemoveLocation}
        onScanLocation={handleScanLocation}
        onScanAll={handleScanAll}
        isScanning={isScanning}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        scanThreads={scanThreads}
        onScanThreadsChange={setScanThreads}
        excludedExtensions={excludedExtensions}
        onOpenExclusions={() => setIsExclusionsModalOpen(true)}
      />

      {/* Main Body per Tab */}
      {activeTab === 'DUPLICATES' && (
        <div className="flex-1 flex flex-col min-h-0">
          <DuplicateSummaryBar
            summary={duplicateData.summary}
            activeScope={activeScope}
            onScopeChange={(scope) => {
              setActiveScope(scope);
              setPage(0);
            }}
            filterLocation={locations.find(l => l.id === filterLocationId)}
            onClearLocationFilter={() => {
              setFilterLocationId(null);
              setPage(0);
            }}
          />

          <DuplicateGroupsList
            groups={duplicateData.groups}
            totalGroups={duplicateData.totalFilteredGroups}
            summary={duplicateData.summary}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            activeScope={activeScope}
            onScopeChange={(scope) => {
              setActiveScope(scope);
              setPage(0);
            }}
            filterLocationId={filterLocationId}
            onFilterLocationChange={(locId) => {
              if (locId && !activeLocationIds.includes(locId)) {
                setActiveLocationIds(prev => [...prev, locId]);
              }
              setFilterLocationId(locId);
              setPage(0);
            }}
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setPage(0);
            }}
            sortBy={sortBy}
            onSortChange={(s) => {
              setSortBy(s);
              setPage(0);
            }}
            locations={locations.filter(l => activeLocationIds.includes(l.id))}
            allLocations={locations}
            selectedFileIds={selectedFileIds}
            onToggleFileSelection={handleToggleFileSelection}
            onApplySmartSelection={handleApplySmartSelection}
            onClearSelection={handleClearSelection}
            onOpenDeleteModal={() => setIsDeleteModalOpen(true)}
            onRevealExplorer={handleRevealExplorer}
            onOpenFile={handleOpenFile}
            onDeleteSingleFile={handleDeleteSingleFile}
            onExcludeExtension={handleQuickExcludeExtension}
            onIgnoreSet={handleIgnoreSet}
            onUnignoreSet={handleUnignoreSet}
            onClearIgnoredSets={handleClearIgnoredSets}
          />
        </div>
      )}

      {activeTab === 'UNIQUE' && (
        <UniqueFilesView
          locations={locations}
          activeLocationIds={activeLocationIds}
          onRevealExplorer={handleRevealExplorer}
          onOpenFile={handleOpenFile}
        />
      )}

      {activeTab === 'STATS' && (
        <ShareStatsView
          stats={statsData}
          onScanLocation={handleScanLocation}
          onRemoveLocation={handleRemoveLocation}
          onFilterDuplicates={handleFilterLocationDuplicates}
          isScanning={isScanning}
        />
      )}

      {/* Modals */}
      <ScanModal
        isOpen={isScanning}
        scanProgress={scanProgress}
        onCancel={handleCancelScan}
      />

      <ScanChoiceModal
        isOpen={isScanChoiceOpen}
        target={scanChoiceTarget}
        onResume={handleChoiceResume}
        onFreshRescan={handleChoiceFresh}
        onClose={() => setIsScanChoiceOpen(false)}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteBatch}
        fileCount={selectedStats.count}
        reclaimedBytes={selectedStats.bytes}
        involvedLocations={selectedStats.locations}
        isDeleting={isDeleting}
      />

      <ExcludedExtensionsModal
        isOpen={isExclusionsModalOpen}
        onClose={() => setIsExclusionsModalOpen(false)}
        excludedExtensions={excludedExtensions}
        onSaveExclusions={handleSaveExclusions}
      />
    </div>
  );
}
