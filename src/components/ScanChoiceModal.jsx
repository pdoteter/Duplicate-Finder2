import React from 'react';
import { PlayCircle, RotateCcw, XCircle, HardDrive, AlertCircle, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function ScanChoiceModal({
  isOpen,
  target,
  onResume,
  onFreshRescan,
  onClose
}) {
  if (!isOpen || !target) return null;

  const isBatch = target.isBatch;
  const isCancelled = target.scan_status === 'cancelled' || target.scan_status === 'paused';
  const fileCount = target.totalIndexedFiles || 0;
  const byteCount = target.totalIndexedBytes || 0;
  const name = isBatch 
    ? `${target.locationCount || 'Selected'} Directories` 
    : (target.location?.label || target.location?.path || 'Directory');

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isCancelled ? 'Resume Incomplete Scan' : 'Scan Option'}
              </h3>
              <p className="text-xs text-slate-400">
                Choose how to proceed for <span className="text-slate-200 font-semibold truncate max-w-[240px] inline-block align-bottom">{name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Status Info Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              Existing Cache:
            </span>
            <span className="font-mono font-bold text-indigo-300">
              {fileCount.toLocaleString()} files ({formatBytes(byteCount)})
            </span>
          </div>

          {isCancelled && (
            <div className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/50 rounded-lg px-2.5 py-1.5 mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Previous scan was cancelled / paused before finishing. Your indexed files are safely preserved.</span>
            </div>
          )}
        </div>

        {/* Action Choice Buttons */}
        <div className="flex flex-col gap-3">
          {/* Option 1: Continue / Resume */}
          <button
            onClick={onResume}
            className="group relative flex items-start gap-3.5 p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/30 hover:bg-indigo-900/40 hover:border-indigo-400 transition-all text-left shadow-lg shadow-indigo-950/30"
          >
            <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white group-hover:text-indigo-200 transition">
                  Continue / Resume Scan
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Picks up right where it left off. Skips the {fileCount.toLocaleString()} files already indexed and only scans the remaining / new files.
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0 self-center" />
          </button>

          {/* Option 2: Fresh Rescan */}
          <button
            onClick={onFreshRescan}
            className="group flex items-start gap-3.5 p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 hover:border-slate-700 transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-slate-800 text-slate-300 shrink-0 mt-0.5 group-hover:text-white transition-colors">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-slate-200 group-hover:text-white transition">
                Fresh Rescan (Start Over)
              </span>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Clears the previous local cache for this directory and indexes every file from scratch.
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 group-hover:text-slate-300 transition-transform shrink-0 self-center" />
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
