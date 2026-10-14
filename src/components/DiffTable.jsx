import React, { useState } from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  ArrowRightLeft, 
  FileWarning, 
  Search, 
  ExternalLink, 
  Copy, 
  Trash2, 
  FileText, 
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  EyeOff,
  Eye
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

export default function DiffTable({
  files = [],
  totalCount = 0,
  page = 0,
  pageSize = 100,
  onPageChange,
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onCopyToMaster,
  onIgnoreFile,
  onUnignoreFile,
  onRevealExplorer,
  onOpenFile,
  onDeleteBackupFile,
  masterRoot,
  backupRoot
}) {
  const [copyingMap, setCopyingMap] = useState({});
  const [copiedMap, setCopiedMap] = useState({});
  const [ignoringMap, setIgnoringMap] = useState({});

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleCopy = async (item) => {
    const key = item.backupFile.relative_path;
    setCopyingMap(prev => ({ ...prev, [key]: true }));
    try {
      await onCopyToMaster(item.backupFile.relative_path);
      setCopiedMap(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap(prev => ({ ...prev, [key]: false }));
      }, 3000);
    } catch (err) {
      alert(`Copy failed: ${err.message}`);
    } finally {
      setCopyingMap(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleIgnore = async (item) => {
    const key = item.backupFile.relative_path;
    setIgnoringMap(prev => ({ ...prev, [key]: true }));
    try {
      await onIgnoreFile(item.backupFile.relative_path);
    } catch (err) {
      alert(`Ignore failed: ${err.message}`);
    } finally {
      setIgnoringMap(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleUnignore = async (item) => {
    const key = item.backupFile.relative_path;
    setIgnoringMap(prev => ({ ...prev, [key]: true }));
    try {
      await onUnignoreFile(item.backupFile.relative_path);
    } catch (err) {
      alert(`Unignore failed: ${err.message}`);
    } finally {
      setIgnoringMap(prev => ({ ...prev, [key]: false }));
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'MISSING_IN_MASTER':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Missing in Master
          </span>
        );
      case 'MODIFIED_CONFLICT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <FileWarning className="w-3.5 h-3.5" />
            Modified Conflict
          </span>
        );
      case 'RELOCATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Relocated
          </span>
        );
      case 'EXACT_DUPLICATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle className="w-3.5 h-3.5" />
            Exact Duplicate
          </span>
        );
      case 'IGNORED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <EyeOff className="w-3.5 h-3.5" />
            Ignored
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
      {/* Controls & Filter Bar */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search filename or path..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Showing <span className="text-slate-100 font-bold">{files.length}</span> of <span className="text-slate-100 font-bold">{totalCount}</span> items
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-slate-400">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs p-8 text-center">
            <ShieldCheck className="w-12 h-12 text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-400">No items matching current criteria</p>
            <p className="mt-1">Try switching filters above or selecting a different folder in the Master tree.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4 w-44">Status</th>
                <th className="py-2.5 px-4">Relative Path & File</th>
                <th className="py-2.5 px-4 w-28">Backup Size</th>
                <th className="py-2.5 px-4 w-64">Master Counterpart Status</th>
                <th className="py-2.5 px-4 w-52 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {files.map((item) => {
                const bf = item.backupFile;
                const mf = item.masterFile;
                const isCopying = copyingMap[bf.relative_path];
                const isCopied = copiedMap[bf.relative_path];

                return (
                  <tr 
                    key={bf.id} 
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Status Badge */}
                    <td className="py-2.5 px-4 align-top whitespace-nowrap">
                      {renderStatusBadge(item.status)}
                    </td>

                    {/* Path & File */}
                    <td className="py-2.5 px-4 align-top">
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-200 break-all">
                            {bf.file_name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono break-all mt-0.5">
                            {bf.relative_path}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Modified: {formatDate(bf.mtime)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Size */}
                    <td className="py-2.5 px-4 align-top font-mono text-slate-300 whitespace-nowrap">
                      {formatBytes(bf.file_size)}
                    </td>

                    {/* Master Counterpart details */}
                    <td className="py-2.5 px-4 align-top text-slate-400">
                      {item.status === 'MISSING_IN_MASTER' && (
                        <div className="text-rose-400 font-medium">
                          ❌ Not in Master (Not found by path or hash)
                        </div>
                      )}

                      {item.status === 'EXACT_DUPLICATE' && (
                        <div className="text-emerald-400 font-medium">
                          ✓ Identical file exists at same path in Master
                        </div>
                      )}

                      {item.status === 'RELOCATED' && mf && (
                        <div>
                          <div className="text-sky-400 font-medium">
                            🔁 Exists at different path in Master:
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 break-all mt-0.5">
                            {mf.relative_path}
                          </div>
                        </div>
                      )}

                      {item.status === 'MODIFIED_CONFLICT' && mf && (
                        <div>
                          <div className="text-amber-400 font-medium">
                            ⚠️ Same path, differs:
                          </div>
                          <div className="text-[11px] text-slate-300 mt-0.5">
                            Master: {formatBytes(mf.file_size)} • {formatDate(mf.mtime)}
                          </div>
                        </div>
                      )}

                      {item.status === 'IGNORED' && (
                        <div>
                          <div className="text-purple-300 font-medium flex items-center gap-1">
                            <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                            Ignored in Backup
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Excluded from Missing in Master
                            {item.ignoredAt ? ` • ${formatDate(item.ignoredAt)}` : ''}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-4 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Copy to Master Button (Prominent for missing files, also available for ignored) */}
                        {(item.status === 'MISSING_IN_MASTER' || item.status === 'IGNORED') && (
                          <button
                            onClick={() => handleCopy(item)}
                            disabled={isCopying || isCopied}
                            className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 shadow transition ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : item.status === 'IGNORED'
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                                : 'bg-rose-600 hover:bg-rose-500 text-white'
                            }`}
                            title="Copy file to Master recreating exact relative path structure"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Copied!
                              </>
                            ) : isCopying ? (
                              'Copying...'
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy to Master
                              </>
                            )}
                          </button>
                        )}

                        {/* Ignore Button on Missing in Master */}
                        {item.status === 'MISSING_IN_MASTER' && (
                          <button
                            onClick={() => handleIgnore(item)}
                            disabled={ignoringMap[bf.relative_path]}
                            className="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 shadow transition disabled:opacity-50"
                            title="Ignore this missing file and keep track that it has been ignored"
                          >
                            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                            {ignoringMap[bf.relative_path] ? 'Ignoring...' : 'Ignore'}
                          </button>
                        )}

                        {/* Unignore Button for Ignored files */}
                        {item.status === 'IGNORED' && (
                          <button
                            onClick={() => handleUnignore(item)}
                            disabled={ignoringMap[bf.relative_path]}
                            className="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 bg-purple-950/60 hover:bg-purple-900 text-purple-300 hover:text-purple-100 border border-purple-500/40 shadow transition disabled:opacity-50"
                            title="Unignore this file and return to Missing in Master"
                          >
                            <Eye className="w-3.5 h-3.5 text-purple-400" />
                            {ignoringMap[bf.relative_path] ? 'Restoring...' : 'Unignore'}
                          </button>
                        )}

                        {/* Show in Windows Explorer */}
                        <button
                          onClick={() => {
                            const fullBackupPath = `${backupRoot}/${bf.relative_path}`.replace(/\//g, '\\');
                            onRevealExplorer(fullBackupPath);
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Reveal in Windows Explorer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Duplicate from Backup */}
                        {item.status === 'EXACT_DUPLICATE' && (
                          <button
                            onClick={() => {
                              if (confirm(`Move duplicate to trash?\n${bf.relative_path}`)) {
                                onDeleteBackupFile(bf.relative_path);
                              }
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition"
                            title="Safely move confirmed duplicate to Recycle Bin"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
