import React from 'react';
import { Loader2, FolderSearch, XCircle, HardDrive, Zap } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function ScanModal({ isOpen, scanProgress, onCancel }) {
  if (!isOpen || !scanProgress) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <FolderSearch className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {scanProgress.multiScan 
                  ? `Scanning Directories (${(scanProgress.currentIndex || 0) + 1}/${scanProgress.totalLocations || 1})`
                  : 'Scanning Directory / Network Share'}
                {scanProgress.resumed && (
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Resumed
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {scanProgress.currentLocationLabel 
                  ? `Current: ${scanProgress.currentLocationLabel}`
                  : scanProgress.skippedExisting > 0
                    ? `Skipping ${scanProgress.skippedExisting.toLocaleString()} previously indexed files...`
                    : 'Gathering metadata & computing progressive hashes'}
              </p>
            </div>
          </div>
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>

        {/* Progress Stats */}
        <div className="grid grid-cols-3 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Files Discovered
            </span>
            <div className="text-xl font-extrabold text-indigo-300 font-mono mt-0.5">
              {(scanProgress.totalFiles || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Data Discovered
            </span>
            <div className="text-xl font-extrabold text-slate-100 font-mono mt-0.5">
              {formatBytes(scanProgress.totalBytes || 0)}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Speed / Threads
            </span>
            <div className="text-sm font-extrabold text-amber-400 font-mono mt-1.5 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-amber-400" />
              <span>{scanProgress.activeThreads || 4} Threads</span>
            </div>
          </div>
        </div>

        {/* Current Folder Path */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs text-slate-300">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-semibold">
            <HardDrive className="w-3 h-3" />
            Currently Traversing:
          </div>
          <div className="font-mono text-indigo-200 truncate" title={scanProgress.currentDir}>
            {scanProgress.currentDir || 'Starting traversal...'}
          </div>
          {scanProgress.currentFile && (
            <div className="text-[11px] text-slate-400 truncate mt-0.5">
              File: {scanProgress.currentFile}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-slate-400">
            Cancelling safely preserves all indexed files to cache.
          </span>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700 text-slate-300 hover:text-rose-200 text-xs font-semibold flex items-center gap-2 transition"
          >
            <XCircle className="w-4 h-4" />
            Cancel Scan
          </button>
        </div>
      </div>
    </div>
  );
}
