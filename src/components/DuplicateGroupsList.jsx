import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Trash2, 
  ExternalLink, 
  FolderOpen, 
  ChevronDown, 
  ChevronRight, 
  CheckSquare, 
  Square, 
  Sparkles, 
  Clock, 
  Network, 
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ShieldCheck,
  Check,
  Folder,
  FolderTree,
  GitCompare,
  Copy,
  Layers,
  HardDrive,
  ArrowLeftRight,
  EyeOff,
  RotateCcw,
  FolderX,
  X
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';
import IgnoreDirectoryModal from './IgnoreDirectoryModal';

export default function DuplicateGroupsList({
  groups = [],
  totalGroups = 0,
  summary = {},
  page = 0,
  pageSize = 50,
  onPageChange,
  activeScope = 'ALL',
  onScopeChange,
  filterLocationId = null,
  onFilterLocationChange,
  searchQuery = '',
  onSearchChange,
  sortBy = 'wasted_space',
  onSortChange,
  locations = [],
  allLocations = [],
  selectedFileIds = new Set(),
  onToggleFileSelection,
  onApplySmartSelection,
  onClearSelection,
  onOpenDeleteModal,
  onRevealExplorer,
  onOpenFile,
  onDeleteSingleFile,
  onExcludeExtension,
  onIgnoreSet,
  onUnignoreSet,
  onClearIgnoredSets,
  onIgnoreDirectory,
  onUnignoreDirectory,
  ignoredDirectories = [],
  activeLocationIds = []
}) {
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [compareCollapsedGroups, setCompareCollapsedGroups] = useState(new Set());
  const [selectedShareForSmart, setSelectedShareForSmart] = useState('');
  const [smartTarget, setSmartTarget] = useState('ALL'); // 'ALL' | 'PAGE'
  const [copiedPaths, setCopiedPaths] = useState({});
  const [ignoreDirModalTarget, setIgnoreDirModalTarget] = useState(null);
  const listContainerRef = useRef(null);

  const handleOpenIgnoreDir = (file) => {
    setIgnoreDirModalTarget(file);
  };

  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [page, groups]);

  const availableLocations = (allLocations && allLocations.length > 0) ? allLocations : locations;
  const filteredLocation = availableLocations.find(l => l.id === filterLocationId);

  const totalPages = Math.ceil(totalGroups / pageSize);

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleDirectoryComparison = (groupId) => {
    setCompareCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedGroups(new Set(groups.map(g => g.groupId)));
  };

  const expandAll = () => {
    setCollapsedGroups(new Set());
  };

  const handleCopyPath = (filePath, key) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(filePath);
      setCopiedPaths(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedPaths(prev => ({ ...prev, [key]: false }));
      }, 2000);
    }
  };

  // Calculate selected files stats
  let totalSelectedBytes = 0;
  let totalSelectedCount = 0;
  for (const group of groups) {
    for (const f of group.files) {
      if (selectedFileIds.has(f.id)) {
        totalSelectedCount++;
        totalSelectedBytes += f.file_size;
      }
    }
  }

  // Helper for group smart actions
  const handleGroupAction = (group, type, targetArg = null) => {
    const files = group.files;
    let fileIdToKeep = null;

    if (type === 'KEEP_THIS_FILE') {
      fileIdToKeep = targetArg;
    } else if (type === 'KEEP_DEEPEST') {
      let maxDepth = -1;
      let deepest = files[0];
      for (const f of files) {
        if (f.depth > maxDepth || (f.depth === maxDepth && f.mtime > (deepest ? deepest.mtime : -Infinity))) {
          maxDepth = f.depth;
          deepest = f;
        }
      }
      fileIdToKeep = deepest.id;
    } else if (type === 'KEEP_SHALLOWEST') {
      let minDepth = Infinity;
      let shallowest = files[0];
      for (const f of files) {
        if (f.depth < minDepth || (f.depth === minDepth && f.mtime > (shallowest ? shallowest.mtime : -Infinity))) {
          minDepth = f.depth;
          shallowest = f;
        }
      }
      fileIdToKeep = shallowest.id;
    } else if (type === 'KEEP_NEWEST') {
      let maxMtime = -Infinity;
      let newestFile = files[0];
      for (const f of files) {
        if (f.mtime > maxMtime) {
          maxMtime = f.mtime;
          newestFile = f;
        }
      }
      fileIdToKeep = newestFile.id;
    } else if (type === 'KEEP_OLDEST') {
      let minMtime = Infinity;
      let oldestFile = files[0];
      for (const f of files) {
        if (f.mtime < minMtime) {
          minMtime = f.mtime;
          oldestFile = f;
        }
      }
      fileIdToKeep = oldestFile.id;
    } else if (type === 'KEEP_LOCATION' && targetArg) {
      const inTarget = files.filter(f => f.location_id === targetArg);
      if (inTarget.length > 0) {
        const best = inTarget.reduce((b, f) => ((f.depth || 0) > (b.depth || 0) || ((f.depth || 0) === (b.depth || 0) && f.mtime > b.mtime) ? f : b), inTarget[0]);
        fileIdToKeep = best.id;
      }
    } else if (type === 'KEEP_OTHER_LOCATIONS' && targetArg) {
      const outsideTarget = files.filter(f => f.location_id !== targetArg);
      if (outsideTarget.length > 0) {
        const best = outsideTarget.reduce((b, f) => ((f.depth || 0) > (b.depth || 0) || ((f.depth || 0) === (b.depth || 0) && f.mtime > b.mtime) ? f : b), outsideTarget[0]);
        fileIdToKeep = best.id;
      } else {
        const best = files.reduce((b, f) => ((f.depth || 0) > (b.depth || 0) || ((f.depth || 0) === (b.depth || 0) && f.mtime > b.mtime) ? f : b), files[0]);
        fileIdToKeep = best.id;
      }
    }

    if (fileIdToKeep) {
      // Deselect the chosen file if it was previously checked for deletion
      if (selectedFileIds.has(fileIdToKeep)) {
        onToggleFileSelection(fileIdToKeep, false);
      }
      // Select all other copies in this group
      files.forEach(f => {
        if (f.id !== fileIdToKeep && !selectedFileIds.has(f.id)) {
          onToggleFileSelection(f.id, true);
        }
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
      {/* Top Filter & Smart Selection Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col gap-3 shrink-0 shadow-md">
        {/* Row 1: Search, Scope Buttons, Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Scope Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs gap-0.5">
            <button
              onClick={() => onScopeChange('ALL')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                activeScope === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Duplicates
            </button>
            <button
              onClick={() => onScopeChange('CROSS_DIRECTORY')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeScope === 'CROSS_DIRECTORY'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Duplicate sets spanning 2 or more different shares"
            >
              <Network className="w-3.5 h-3.5" />
              Cross-Directory
            </button>
            <button
              onClick={() => onScopeChange('DIFF_FOLDERS')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeScope === 'DIFF_FOLDERS'
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Duplicate sets where copies are in different folder hierarchies"
            >
              <FolderTree className="w-3.5 h-3.5" />
              Different Folders
            </button>
            <button
              onClick={() => onScopeChange('ROOT_VS_SUBFOLDER')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeScope === 'ROOT_VS_SUBFOLDER'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Sets with both loose root copies and organized subfolder copies"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Root vs Subfolder
            </button>
            <button
              onClick={() => onScopeChange('SAME_DIRECTORY')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeScope === 'SAME_DIRECTORY'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Duplicate files residing within the exact same share"
            >
              Same-Share Only
            </button>
            <button
              onClick={() => onScopeChange('IGNORED')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeScope === 'IGNORED'
                  ? 'bg-slate-600 text-white ring-1 ring-slate-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Duplicate sets you have marked as ignored"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ignored ({(summary.ignoredGroups || 0).toLocaleString()})</span>
            </button>
          </div>

          {/* Share Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 shrink-0">
            <HardDrive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-slate-400 font-medium">Share:</span>
            <select
              value={filterLocationId || ''}
              onChange={(e) => onFilterLocationChange && onFilterLocationChange(e.target.value ? Number(e.target.value) : null)}
              className="bg-transparent text-slate-200 font-semibold text-xs focus:outline-none cursor-pointer max-w-[170px] truncate"
              title="Filter duplicate sets involving a specific monitored share"
            >
              <option value="" className="bg-slate-900 text-slate-300">All Shares ({availableLocations.length})</option>
              {availableLocations.map(l => (
                <option key={l.id} value={l.id} className="bg-slate-900 text-slate-200">
                  {l.label || l.path}
                </option>
              ))}
            </select>
            {filterLocationId && (
              <button
                onClick={() => onFilterLocationChange && onFilterLocationChange(null)}
                className="text-slate-400 hover:text-white transition-colors ml-0.5"
                title="Clear share filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-md min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search duplicates by filename or folder path..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="wasted_space">Recoverable Space (High to Low)</option>
              <option value="file_size">File Size (Largest first)</option>
              <option value="duplicate_count">Duplicate Copies Count</option>
              <option value="file_name">File Name (A-Z)</option>
              <option value="directory">Directory (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Smart Selection Assistants & Delete Action Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Smart Select:
            </span>

            {/* Target Scope: All 47k sets vs Page */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-md border border-slate-800 text-[11px] mr-1">
              <button
                onClick={() => setSmartTarget('ALL')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  smartTarget === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Apply rule across ALL ${totalGroups.toLocaleString()} duplicate sets`}
              >
                All Sets ({totalGroups.toLocaleString()})
              </button>
              <button
                onClick={() => setSmartTarget('PAGE')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  smartTarget === 'PAGE'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Apply rule only to visible sets on this page"
              >
                Page Only
              </button>
            </div>

            {/* Smart Rule: Keep Deepest / Most Organized */}
            <button
              onClick={() => onApplySmartSelection('KEEP_DEEPEST', null, smartTarget)}
              className="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-xs rounded-md border border-emerald-700/60 transition-colors flex items-center gap-1 font-medium"
              title="Keeps the copy in the deepest/most organized subfolder and marks loose root/shallow copies for deletion"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              Keep Deepest (Organized)
            </button>

            <button
              onClick={() => onApplySmartSelection('KEEP_NEWEST', null, smartTarget)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors"
              title="Marks all copies for deletion except the newest modified copy in each group"
            >
              Keep Newest
            </button>

            <button
              onClick={() => onApplySmartSelection('KEEP_OLDEST', null, smartTarget)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors"
              title="Marks all copies for deletion except the oldest copy in each group"
            >
              Keep Oldest
            </button>

            {locations.length > 1 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedShareForSmart}
                  onChange={(e) => setSelectedShareForSmart(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1 focus:outline-none"
                >
                  <option value="">Keep in Share...</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>Keep in {l.label || l.path}</option>
                  ))}
                </select>
                {selectedShareForSmart && (
                  <button
                    onClick={() => onApplySmartSelection('KEEP_LOCATION', Number(selectedShareForSmart), smartTarget)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md font-medium transition-colors"
                  >
                    Apply
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => onApplySmartSelection('KEEP_FIRST', null, smartTarget)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors"
              title="Marks all copies except the first reference file in each group"
            >
              Keep 1st Copy
            </button>

            <button
              onClick={() => onApplySmartSelection('KEEP_SECOND', null, smartTarget)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors"
              title="Marks all copies except the second copy in each group"
            >
              Keep 2nd Copy
            </button>

            <button
              onClick={() => onApplySmartSelection('INVERT', null, smartTarget)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md border border-slate-700 transition-colors flex items-center gap-1"
              title="Inverts the current selection in each duplicate group (swaps kept and selected copies)"
            >
              <ArrowLeftRight className="w-3 h-3 text-indigo-400" />
              Invert Selection
            </button>

            {selectedFileIds.size > 0 && (
              <button
                onClick={onClearSelection}
                className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs underline transition-colors"
              >
                Clear Selection ({selectedFileIds.size.toLocaleString()})
              </button>
            )}
          </div>

          {/* Action Trigger Button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={expandAll}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                Expand All
              </button>
              <span className="text-slate-600">|</span>
              <button
                onClick={collapseAll}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                Collapse All
              </button>
            </div>

            <button
              onClick={onOpenDeleteModal}
              disabled={selectedFileIds.size === 0}
              className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white disabled:text-slate-500 rounded-lg text-xs font-semibold shadow-md shadow-rose-900/30 transition-all disabled:shadow-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                Trash Selected ({selectedFileIds.size.toLocaleString()} files{totalSelectedBytes > 0 ? ` • ${formatBytes(totalSelectedBytes)}` : ''})
              </span>
            </button>
          </div>
        </div>

        {/* Row 3: Dedicated Share Filter & Decision Assistant Banner */}
        {filteredLocation && (
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-indigo-500/30 shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: filteredLocation.color || '#6366f1' }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">
                    Filtering Share:
                  </span>
                  <span className="text-xs font-bold text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-950/90 border border-indigo-600/50">
                    {filteredLocation.label || filteredLocation.path}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    • {totalGroups.toLocaleString()} duplicate sets
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate max-w-lg mt-0.5" title={filteredLocation.path}>
                  {filteredLocation.path}
                </div>
              </div>
            </div>

            {/* Quick-decision assistants for this share */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] text-slate-400 font-semibold mr-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Decide copies:
              </span>
              <button
                onClick={() => onApplySmartSelection('KEEP_LOCATION', filteredLocation.id, smartTarget)}
                className="px-2.5 py-1 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 text-xs rounded-lg border border-emerald-600/60 transition-colors flex items-center gap-1.5 font-medium shadow-sm"
                title={`Keep copies in "${filteredLocation.label || filteredLocation.path}" and mark duplicate copies in other shares for deletion`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Keep in {filteredLocation.label || 'This Share'}</span>
              </button>

              {availableLocations.length > 1 && (
                <button
                  onClick={() => onApplySmartSelection('KEEP_OTHER_LOCATIONS', filteredLocation.id, smartTarget)}
                  className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-xs rounded-lg border border-rose-800/60 transition-colors flex items-center gap-1.5 font-medium shadow-sm"
                  title={`Keep copies in other shares and mark duplicate copies in "${filteredLocation.label || filteredLocation.path}" for deletion`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Clean {filteredLocation.label || 'This Share'}</span>
                </button>
              )}

              <button
                onClick={() => onFilterLocationChange && onFilterLocationChange(null)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-1 ml-1"
                title="View duplicates across all shares"
              >
                <X className="w-3 h-3 text-slate-400" />
                <span>Clear Filter</span>
              </button>
            </div>
          </div>
        )}

        {/* Ignored Sets Management Banner */}
        {activeScope === 'IGNORED' && (
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-700/60 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-200">
                      Viewing Ignored Duplicate Sets ({totalGroups.toLocaleString()})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      • Excluded from active duplicate counts and Smart Select rules
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {totalGroups > 0 && onClearIgnoredSets && (
                  <button
                    onClick={() => {
                      if (confirm(`Restore all ${totalGroups.toLocaleString()} ignored duplicate sets and directories?`)) {
                        onClearIgnoredSets();
                      }
                    }}
                    className="px-2.5 py-1 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 text-xs rounded-lg border border-indigo-600/60 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                    title="Unignore all sets and return them to the active duplicates list"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Restore All Ignored Sets</span>
                  </button>
                )}
                <button
                  onClick={() => onScopeChange('ALL')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3 text-slate-400" />
                  <span>Back to Active Duplicates</span>
                </button>
              </div>
            </div>

            {/* Ignored Directories List */}
            {ignoredDirectories && ignoredDirectories.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 shrink-0">
                  <FolderX className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ignored Directories ({ignoredDirectories.length}):</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ignoredDirectories.map((dir) => (
                    <div
                      key={`${dir.location_id}_${dir.directory_path}`}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono"
                    >
                      <span
                        className="px-1 py-0.2 rounded text-[10px] font-sans font-bold"
                        style={{
                          backgroundColor: `${dir.location_color || '#6366f1'}25`,
                          color: dir.location_color || '#a5b4fc'
                        }}
                      >
                        {dir.location_label || `Share ${dir.location_id}`}
                      </span>
                      <span className="text-amber-200 font-semibold">{dir.directory_path || '[Share Root]'}</span>
                      <span className="text-[10px] text-slate-400 font-sans">({dir.sets_count || 0} sets)</span>
                      {onUnignoreDirectory && (
                        <button
                          onClick={() => {
                            if (confirm(`Unignore directory "${dir.directory_path || '[Root]'}" and restore its duplicate sets?`)) {
                              onUnignoreDirectory(dir.location_id, dir.directory_path);
                            }
                          }}
                          className="p-0.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors ml-0.5 cursor-pointer"
                          title={`Unignore directory "${dir.directory_path}" and restore its sets`}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Groups List Scroll Area */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-3 text-slate-400">
              {activeScope === 'IGNORED' ? (
                <EyeOff className="w-10 h-10 text-slate-500 mx-auto" />
              ) : (
                <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-200">
              {activeScope === 'IGNORED' ? 'No Ignored Sets' : 'No Duplicates Found'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              {activeScope === 'IGNORED'
                ? 'You have not ignored any duplicate sets yet. Click "Ignore Set" on any duplicate group to hide it from active comparisons.'
                : searchQuery
                ? `No duplicates match the search "${searchQuery}". Try clearing the search query.`
                : activeScope !== 'ALL'
                ? `No duplicates match the scope filter. Try switching back to "All Duplicates".`
                : `All files across the active directories are unique, or the directories have not yet been scanned.`}
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.groupId);
            const isCompareCollapsed = compareCollapsedGroups.has(group.groupId);
            const isCompareOpen = !isCompareCollapsed; // Open by default when group expanded
            const groupSelectedCount = group.files.filter(f => selectedFileIds.has(f.id)).length;
            const otherSelectedCount = groupSelectedCount;

            return (
              <div
                key={group.groupId}
                className="border border-slate-800 bg-slate-900/90 rounded-xl overflow-hidden shadow-sm transition-all hover:border-slate-700/80"
              >
                {/* Group Header Card */}
                <div
                  onClick={() => toggleGroupCollapse(group.groupId)}
                  className="px-4 py-3 bg-slate-900 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none border-b border-slate-800/70 hover:bg-slate-850 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      className="text-slate-400 hover:text-white transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupCollapse(group.groupId);
                      }}
                    >
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {sortBy === 'directory' && (
                          <div
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-950/70 border border-indigo-700/60 font-mono text-[11px] text-indigo-200"
                            title={`Directory path (minus monitored part): ${group.primaryDirectory || '[Root]'}`}
                          >
                            <Folder className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="font-semibold">{group.primaryDirectory || '[Root]'}</span>
                          </div>
                        )}
                        <span className="text-xs font-semibold text-slate-100 truncate" title={group.fileName}>
                          {group.fileName}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {formatBytes(group.fileSize)}
                        </span>
                        {onExcludeExtension && group.files?.[0]?.file_extension && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const ext = group.files[0].file_extension.toLowerCase();
                              if (confirm(`Exclude all ".${ext}" files and remove them from the database?`)) {
                                onExcludeExtension(ext);
                              }
                            }}
                            title={`Exclude all .${group.files[0].file_extension} files and clean them from the database`}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-rose-950/70 text-slate-400 hover:text-rose-300 border border-slate-700/70 hover:border-rose-700/60 font-mono transition-colors"
                          >
                            Exclude .{group.files[0].file_extension}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Group Badges and Quick Action Helpers */}
                  <div className="flex items-center gap-2.5 shrink-0 text-xs">
                    {/* Directory Diff Badge */}
                    {group.hasRootAndSubfolder ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800/50 text-[10px] font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        Root vs Subfolder
                      </span>
                    ) : group.isCrossDirectory ? (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 text-[10px] font-semibold flex items-center gap-1">
                        <Network className="w-3 h-3" />
                        {group.locationsInvolved.length} Shares
                      </span>
                    ) : group.hasDifferentDirs ? (
                      <span className="px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/50 text-[10px] font-semibold flex items-center gap-1">
                        <FolderTree className="w-3 h-3" />
                        {group.uniqueDirsCount} Folders
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800/70 text-slate-400 border border-slate-700/60 text-[10px] font-medium">
                        Same Folder
                      </span>
                    )}

                    {/* Wasted Space Badge */}
                    <span className="px-2 py-0.5 rounded-full bg-rose-950/50 text-rose-300 border border-rose-800/50 text-[10px] font-bold">
                      +{formatBytes(group.wastedBytes)} Wasted
                    </span>

                    {/* Copies badge */}
                    <span className="text-[11px] text-slate-400 font-medium">
                      {group.fileCount} copies
                    </span>

                    {/* Directory Comparison Toggle Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCollapsed) toggleGroupCollapse(group.groupId);
                        toggleDirectoryComparison(group.groupId);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 border ${
                        !isCollapsed && isCompareOpen
                          ? 'bg-indigo-950 text-indigo-300 border-indigo-700/80 shadow-sm'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                      title="Inspect and compare directory paths side-by-side"
                    >
                      <GitCompare className="w-3 h-3 text-indigo-400" />
                      <span>Compare Dirs</span>
                    </button>

                    {/* Group Quick Select Actions */}
                    <div 
                      className="flex items-center gap-1 pl-2 border-l border-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {filterLocationId && group.locationsInvolved.includes(filterLocationId) && (
                        <button
                          onClick={() => handleGroupAction(group, 'KEEP_LOCATION', filterLocationId)}
                          className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/70 text-[10px] rounded transition-colors font-semibold"
                          title={`Keep copy in ${filteredLocation?.label || 'filtered share'} and delete other copies`}
                        >
                          Keep in {filteredLocation?.label || 'Share'}
                        </button>
                      )}
                      {group.maxDepth > group.minDepth && (
                        <button
                          onClick={() => handleGroupAction(group, 'KEEP_DEEPEST')}
                          className="px-2 py-0.5 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 text-[10px] rounded transition-colors font-medium"
                          title="Keeps deepest organized copy and marks root/shallow copies for deletion"
                        >
                          Keep Deepest
                        </button>
                      )}
                      <button
                        onClick={() => handleGroupAction(group, 'KEEP_NEWEST')}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded transition-colors"
                        title="Mark all except newest copy in this group"
                      >
                        Keep Newest
                      </button>
                      <button
                        onClick={() => handleGroupAction(group, 'KEEP_OLDEST')}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded transition-colors"
                        title="Mark all except oldest copy in this group"
                      >
                        Keep Oldest
                      </button>

                      {group.isIgnored ? (
                        onUnignoreSet && (
                          <button
                            onClick={() => onUnignoreSet(group)}
                            className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/70 text-[10px] rounded transition-colors flex items-center gap-1 font-medium ml-1"
                            title="Restore this set back to active duplicate groups"
                          >
                            <RotateCcw className="w-3 h-3 text-indigo-400" />
                            <span>Unignore Set</span>
                          </button>
                        )
                      ) : (
                        onIgnoreSet && (
                          <button
                            onClick={() => onIgnoreSet(group)}
                            className="px-2 py-0.5 bg-slate-800/90 hover:bg-amber-950/80 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-700/70 text-[10px] rounded transition-colors flex items-center gap-1 font-medium ml-1"
                            title="Ignore this duplicate set (hides it from active duplicates and Smart Select)"
                          >
                            <EyeOff className="w-3 h-3 text-slate-400" />
                            <span>Ignore Set</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Group Files Breakdown */}
                {!isCollapsed && (
                  <div className="bg-slate-950/60">
                    {/* Visual Directory Comparison & Decision Card */}
                    {isCompareOpen && (
                      <div className="p-3 bg-slate-900/90 border-b border-indigo-900/30">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60">
                          <div className="flex items-center gap-2">
                            <GitCompare className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold text-slate-200">
                              Directory Comparison Matrix
                            </span>
                            {group.directoryInsight?.text && (
                              <span className="text-[11px] text-slate-400 font-normal">
                                • {group.directoryInsight.text}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {group.maxDepth > group.minDepth && (
                              <button
                                onClick={() => handleGroupAction(group, 'KEEP_DEEPEST')}
                                className="px-2.5 py-0.5 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold rounded flex items-center gap-1 transition-colors"
                              >
                                <Sparkles className="w-3 h-3 text-amber-300" />
                                Keep Most Organized (Deepest)
                              </button>
                            )}
                            {group.locationsInvolved.length > 1 && group.locationsInvolved.map(locId => {
                              const loc = locations.find(l => l.id === locId);
                              const name = loc?.label || `Share ${locId}`;
                              return (
                                <button
                                  key={locId}
                                  onClick={() => handleGroupAction(group, 'KEEP_LOCATION', locId)}
                                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700 transition-colors"
                                  title={`Keep file in ${name} and trash copies in other shares`}
                                >
                                  Keep in {name}
                                </button>
                              );
                            })}
                            {group.isIgnored ? (
                              onUnignoreSet && (
                                <button
                                  onClick={() => onUnignoreSet(group)}
                                  className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/70 text-[10px] rounded transition-colors flex items-center gap-1 font-medium"
                                  title="Restore this set back to active duplicate groups"
                                >
                                  <RotateCcw className="w-3 h-3 text-indigo-400" />
                                  <span>Unignore Set</span>
                                </button>
                              )
                            ) : (
                              onIgnoreSet && (
                                <button
                                  onClick={() => onIgnoreSet(group)}
                                  className="px-2 py-0.5 bg-slate-800 hover:bg-amber-950/80 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-700/70 text-[10px] rounded transition-colors flex items-center gap-1"
                                  title="Ignore this duplicate set (hides it from active duplicates and Smart Select)"
                                >
                                  <EyeOff className="w-3 h-3 text-slate-400" />
                                  <span>Ignore Set</span>
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Directory Matrix Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                <th className="pb-1.5 pl-2 font-medium w-8">Trash</th>
                                <th className="pb-1.5 font-medium min-w-[120px]">Share / Root</th>
                                <th className="pb-1.5 font-medium">Directory Hierarchy (Folder Path)</th>
                                <th className="pb-1.5 font-medium min-w-[120px]">Organization Level</th>
                                <th className="pb-1.5 font-medium min-w-[110px]">Date Modified</th>
                                <th className="pb-1.5 font-medium min-w-[120px] text-right pr-2">Decision Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                              {group.files.map((file) => {
                                const isSelected = selectedFileIds.has(file.id);
                                const isBestOrganized = file.id === group.deepestFileId && group.maxDepth > 0;
                                const isSoleSafeCopy = !isSelected && group.files.filter(f => f.id !== file.id && selectedFileIds.has(f.id)).length === group.files.length - 1;

                                return (
                                  <tr
                                    key={file.id}
                                    className={`transition-colors ${
                                      isSelected
                                        ? 'bg-rose-950/20 text-slate-300'
                                        : isSoleSafeCopy
                                        ? 'bg-emerald-950/15'
                                        : 'hover:bg-slate-800/40 text-slate-200'
                                    }`}
                                  >
                                    {/* Selection Checkbox */}
                                    <td className="py-2 pl-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked && isSoleSafeCopy) {
                                            if (!confirm('Warning: Marking all copies will delete EVERY instance. Keep at least 1 safe copy to avoid permanent data loss. Continue anyway?')) {
                                              return;
                                            }
                                          }
                                          onToggleFileSelection(file.id, e.target.checked);
                                        }}
                                        className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                        title={isSelected ? 'Deselect (keep file)' : 'Select for deletion (trash)'}
                                      />
                                    </td>

                                    {/* Share Badge & Root Path */}
                                    <td className="py-2 pr-3 align-top">
                                      <div className="flex flex-col gap-0.5">
                                        <span
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold w-fit border inline-flex items-center gap-1"
                                          style={{
                                            backgroundColor: `${file.location_color || '#6366f1'}20`,
                                            borderColor: `${file.location_color || '#6366f1'}50`,
                                            color: file.location_color || '#a5b4fc'
                                          }}
                                        >
                                          <span>{file.location_label || file.location_path}</span>
                                          {file.location_id === filterLocationId && (
                                            <span className="px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-200 text-[9px] font-bold">Filtered</span>
                                          )}
                                        </span>
                                        <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]" title={file.location_path}>
                                          {file.location_path}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Directory Breadcrumbs */}
                                    <td className="py-2 pr-3 align-top">
                                      {file.isRoot ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/50 font-mono text-[11px]">
                                            <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                                            <span>[Share Root Folder]</span>
                                          </div>
                                          {onIgnoreDirectory && (
                                            <button
                                              onClick={() => handleOpenIgnoreDir(file)}
                                              className="px-2 py-0.5 bg-slate-800/90 hover:bg-amber-950 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-700/80 rounded text-[10px] font-sans font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                                              title="Ignore duplicate sets in share root"
                                            >
                                              <FolderX className="w-3 h-3 text-amber-400" />
                                              <span>Ignore Root</span>
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                                          <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                          {file.dirSegments.map((segment, idx) => (
                                            <React.Fragment key={idx}>
                                              {idx > 0 && <span className="text-slate-600">/</span>}
                                              <span
                                                className={`px-1.5 py-0.5 rounded border ${
                                                  idx === file.dirSegments.length - 1
                                                    ? 'bg-indigo-950/80 border-indigo-700/70 text-indigo-200 font-semibold shadow-sm'
                                                    : 'bg-slate-800/80 border-slate-700/60 text-slate-300'
                                                }`}
                                                title={idx === file.dirSegments.length - 1 ? `Parent folder: ${segment}` : segment}
                                              >
                                                {segment}
                                              </span>
                                            </React.Fragment>
                                          ))}

                                          {/* Ignore Directory Button right next to folder path */}
                                          {(() => {
                                            const isDirIgnored = ignoredDirectories.some(
                                              d => d.location_id === file.location_id && (d.directory_path === (file.dirPath || '') || (file.dirPath && file.dirPath.startsWith(d.directory_path + '/')))
                                            );

                                            if (isDirIgnored) {
                                              return (
                                                <span 
                                                  className="ml-2 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[10px] font-sans font-semibold inline-flex items-center gap-1"
                                                  title="This directory is currently marked as ignored"
                                                >
                                                  <FolderX className="w-3 h-3 text-amber-400" />
                                                  <span>Directory Ignored</span>
                                                </span>
                                              );
                                            }

                                            if (onIgnoreDirectory) {
                                              return (
                                                <button
                                                  onClick={() => handleOpenIgnoreDir(file)}
                                                  className="ml-2 px-2 py-0.5 bg-slate-800/90 hover:bg-amber-950 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-700/80 rounded text-[10px] font-sans font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                                                  title={`Ignore all duplicate sets in directory "${file.dirPath}"`}
                                                >
                                                  <FolderX className="w-3 h-3 text-amber-400" />
                                                  <span>Ignore Directory</span>
                                                </button>
                                              );
                                            }

                                            return null;
                                          })()}
                                        </div>
                                      )}

                                      {/* Sub-row with filename if renamed or different */}
                                      {file.file_name !== group.fileName && (
                                        <div className="text-[10px] text-amber-400 font-mono mt-1 flex items-center gap-1">
                                          <span className="px-1 py-0.2 bg-amber-950 text-amber-300 rounded border border-amber-800 text-[9px] font-semibold">
                                            Renamed
                                          </span>
                                          <span>{file.file_name}</span>
                                        </div>
                                      )}
                                    </td>

                                    {/* Organization Depth Rating */}
                                    <td className="py-2 pr-3 align-top">
                                      {isBestOrganized ? (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-700/50 text-[10px] font-bold inline-flex items-center gap-1">
                                          ⭐ Depth {file.depth} (Most Organized)
                                        </span>
                                      ) : file.isRoot ? (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                                          Depth 0 (Loose in Root)
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/80 text-[10px]">
                                          Depth {file.depth}
                                        </span>
                                      )}
                                    </td>

                                    {/* Date Modified */}
                                    <td className="py-2 pr-3 align-top">
                                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                        <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                        <span>{formatDate(file.mtime)}</span>
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5">
                                        {file.isNewest && (
                                          <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[9px] font-semibold">
                                            Newest
                                          </span>
                                        )}
                                        {file.isOldest && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40 text-[9px] font-semibold">
                                            Oldest
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* 1-Click Keep Action */}
                                    <td className="py-2 pr-2 text-right align-top">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => handleGroupAction(group, 'KEEP_THIS_FILE', file.id)}
                                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                            isSoleSafeCopy
                                              ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                                              : 'bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-500'
                                          }`}
                                          title="Keep this file and mark all other duplicate copies in this group for deletion"
                                        >
                                          {isSoleSafeCopy ? '✓ Keeping This' : 'Keep This Copy'}
                                        </button>

                                        {/* Action helpers */}
                                        {onIgnoreDirectory && (
                                          <button
                                            onClick={() => handleOpenIgnoreDir(file)}
                                            title={`Ignore Directory: "${file.dirPath || 'Root'}"`}
                                            className="p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-950/40 rounded transition-colors cursor-pointer"
                                          >
                                            <FolderX className="w-3.5 h-3.5 text-amber-400/80" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleCopyPath(file.fullPath, file.id)}
                                          title="Copy Full File Path"
                                          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                        >
                                          {copiedPaths[file.id] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                          onClick={() => onOpenFile(file.fullPath)}
                                          title="Open File"
                                          className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => onRevealExplorer(file.fullPath)}
                                          title="Show in Windows Explorer"
                                          className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                                        >
                                          <FolderOpen className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => onDeleteSingleFile(file.id)}
                                          title="Move this duplicate copy to Recycle Bin"
                                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Standard File Breakdown Rows */}
                    <div className="divide-y divide-slate-800/60">
                      {group.files.map((file) => {
                        const isSelected = selectedFileIds.has(file.id);
                        const otherSelectedCount = group.files.filter(f => f.id !== file.id && selectedFileIds.has(f.id)).length;
                        const isLastRemainingSafeCopy = !isSelected && otherSelectedCount === group.files.length - 1;

                        return (
                          <div
                            key={file.id}
                            className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                              isSelected
                                ? 'bg-rose-950/25 border-l-2 border-rose-500'
                                : 'hover:bg-slate-900/60'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Checkbox with safe guard */}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked && isLastRemainingSafeCopy) {
                                    if (!confirm('Warning: Marking all copies will delete EVERY instance. Keep at least 1 safe copy to avoid permanent data loss. Continue anyway?')) {
                                      return;
                                    }
                                  }
                                  onToggleFileSelection(file.id, e.target.checked);
                                }}
                                className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                title={isSelected ? 'Deselect (keep file)' : 'Select for deletion (trash)'}
                              />

                              {/* Share Badge */}
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 border inline-flex items-center gap-1"
                                style={{
                                  backgroundColor: `${file.location_color || '#6366f1'}20`,
                                  borderColor: `${file.location_color || '#6366f1'}50`,
                                  color: file.location_color || '#a5b4fc'
                                }}
                                title={file.location_path}
                              >
                                <span>{file.location_label || file.location_path}</span>
                                {file.location_id === filterLocationId && (
                                  <span className="px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-200 text-[9px] font-bold">Filtered</span>
                                )}
                              </span>

                              {/* Directory Path and Filename clearly separated */}
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                {file.isRoot ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-amber-400 font-mono text-[11px] bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/40 inline-flex items-center gap-1">
                                      <Folder className="w-3 h-3 text-amber-400" />
                                      [Root]
                                    </span>
                                    {onIgnoreDirectory && (
                                      <button
                                        onClick={() => handleOpenIgnoreDir(file)}
                                        className="px-1.5 py-0.2 bg-slate-800/80 hover:bg-amber-950/90 text-slate-400 hover:text-amber-200 border border-slate-700/70 hover:border-amber-700/70 rounded text-[9px] font-sans inline-flex items-center gap-0.5 shrink-0 transition-colors cursor-pointer"
                                        title="Ignore duplicate sets in share root"
                                      >
                                        <FolderX className="w-2.5 h-2.5 text-amber-400" />
                                        <span>Ignore Root</span>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 min-w-0">
                                    <div
                                      className="font-mono text-slate-400 text-[11px] truncate flex items-center gap-1 cursor-pointer hover:underline"
                                      title={`Full folder: ${file.fullDir}`}
                                      onClick={() => onRevealExplorer(file.fullPath)}
                                    >
                                      <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      <span className="text-slate-300 font-medium">{file.dirPath}/</span>
                                    </div>
                                    {onIgnoreDirectory && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenIgnoreDir(file);
                                        }}
                                        className="px-1.5 py-0.2 bg-slate-800/80 hover:bg-amber-950/90 text-slate-400 hover:text-amber-200 border border-slate-700/70 hover:border-amber-700/70 rounded text-[9px] font-sans inline-flex items-center gap-0.5 shrink-0 transition-colors cursor-pointer"
                                        title={`Ignore Directory: "${file.dirPath}"`}
                                      >
                                        <FolderX className="w-2.5 h-2.5 text-amber-400" />
                                        <span>Ignore Dir</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                                <span
                                  className="font-mono text-slate-100 text-[11px] truncate cursor-pointer hover:underline font-semibold"
                                  title={`Full path: ${file.fullPath}`}
                                  onClick={() => onRevealExplorer(file.fullPath)}
                                >
                                  {file.file_name}
                                </span>
                              </div>
                            </div>

                            {/* File Metadata & Badges */}
                            <div className="flex items-center gap-3 shrink-0">
                              {/* Date Modified with Newest/Oldest badge */}
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{formatDate(file.mtime)}</span>
                                {file.isNewest && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[9px] font-semibold">
                                    Newest
                                  </span>
                                )}
                                {file.isOldest && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40 text-[9px] font-semibold">
                                    Oldest
                                  </span>
                                )}
                              </div>

                              {/* Individual Action Buttons */}
                              <div className="flex items-center gap-1">
                                {onIgnoreDirectory && (
                                  <button
                                    onClick={() => handleOpenIgnoreDir(file)}
                                    title={`Ignore Directory: "${file.dirPath || 'Root'}"`}
                                    className="p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-950/40 rounded transition-colors cursor-pointer"
                                  >
                                    <FolderX className="w-3.5 h-3.5 text-amber-400/80" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleCopyPath(file.fullPath, `row_${file.id}`)}
                                  title="Copy Full File Path"
                                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                >
                                  {copiedPaths[`row_${file.id}`] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => onOpenFile(file.fullPath)}
                                  title="Open File"
                                  className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onRevealExplorer(file.fullPath)}
                                  title="Show in Windows Explorer"
                                  className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onDeleteSingleFile(file.id)}
                                  title="Move this duplicate copy to Windows Recycle Bin"
                                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div>
            Showing sets {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalGroups)} of {totalGroups.toLocaleString()}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-slate-300">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 transition-colors"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Ignore Directory Modal */}
      <IgnoreDirectoryModal
        isOpen={!!ignoreDirModalTarget}
        onClose={() => setIgnoreDirModalTarget(null)}
        targetFile={ignoreDirModalTarget}
        activeLocationIds={activeLocationIds}
        onConfirm={onIgnoreDirectory}
      />
    </div>
  );
}
