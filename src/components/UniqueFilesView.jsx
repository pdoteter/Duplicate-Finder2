import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileCheck, 
  Search, 
  ExternalLink, 
  FolderOpen, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert,
  HardDrive,
  Clock
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

export default function UniqueFilesView({
  locations = [],
  activeLocationIds = [],
  onRevealExplorer,
  onOpenFile
}) {
  const [selectedTargetId, setSelectedTargetId] = useState(activeLocationIds[0] || (locations[0] ? locations[0].id : null));
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('size');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [uniqueData, setUniqueData] = useState({
    summary: { totalUniqueFiles: 0, totalUniqueBytes: 0 },
    files: [],
    totalCount: 0
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedTargetId && locations.length > 0) {
      setSelectedTargetId(locations[0].id);
    }
  }, [locations, selectedTargetId]);

  const loadUniqueFiles = useCallback(async () => {
    if (!window.api || !selectedTargetId) return;
    setIsLoading(true);
    try {
      const otherIds = activeLocationIds.filter(id => id !== selectedTargetId);
      const res = await window.api.getUniqueFiles(selectedTargetId, otherIds, {
        search: searchQuery,
        sortBy,
        sortOrder,
        limit: pageSize,
        offset: page * pageSize
      });
      setUniqueData(res);
    } catch (err) {
      console.error('Failed to load unique files:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTargetId, activeLocationIds, searchQuery, sortBy, sortOrder, page]);

  useEffect(() => {
    loadUniqueFiles();
  }, [loadUniqueFiles]);

  const targetLocation = locations.find(l => l.id === selectedTargetId);
  const totalPages = Math.ceil((uniqueData.totalCount || 0) / pageSize);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
      {/* Top Controls Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-md">
        {/* Directory Picker */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <HardDrive className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">
            Inspect Unique Files in:
          </span>
          <select
            value={selectedTargetId || ''}
            onChange={(e) => {
              setSelectedTargetId(Number(e.target.value));
              setPage(0);
            }}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label || l.path}
              </option>
            ))}
          </select>
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Filter unique files..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
          >
            <option value="size">Sort: Size (Largest)</option>
            <option value="name">Sort: Name (A-Z)</option>
            <option value="mtime">Sort: Date Modified</option>
          </select>
        </div>
      </div>

      {/* Target Share Summary Banner */}
      {targetLocation && (
        <div className="px-6 py-3 bg-indigo-950/20 border-b border-indigo-900/30 flex items-center justify-between text-xs text-slate-300 shrink-0">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>
              <strong>{uniqueData.summary.totalUniqueFiles.toLocaleString()} files</strong> ({formatBytes(uniqueData.summary.totalUniqueBytes)}) exist <strong>ONLY</strong> in this directory.
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Protected content: No duplicate copy found on any other active share.
          </span>
        </div>
      )}

      {/* Unique Files Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {uniqueData.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-3 text-slate-500">
              <FileCheck className="w-10 h-10 mx-auto text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">
              No Unique Files Found
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {searchQuery
                ? `No unique files match the search "${searchQuery}".`
                : `All files in this directory appear to have duplicate copies in your other selected shares.`}
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Relative Path</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4">Modified</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {uniqueData.files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-slate-100 max-w-[220px] truncate" title={file.file_name}>
                      {file.file_name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 max-w-[340px] truncate" title={file.relative_path}>
                      {file.relative_path}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-300">
                      {formatBytes(file.file_size)}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-slate-400">
                      {formatDate(file.mtime)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div>
            Showing files {page * pageSize + 1} - {Math.min((page + 1) * pageSize, uniqueData.totalCount)} of {uniqueData.totalCount}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-slate-300">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
