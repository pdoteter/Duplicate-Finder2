import React from 'react';
import { 
  HardDrive, 
  RefreshCw, 
  Trash2, 
  PieChart, 
  AlertCircle, 
  CheckCircle2, 
  BarChart3,
  Layers
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

export default function ShareStatsView({
  stats = [],
  onScanLocation,
  onRemoveLocation,
  onFilterDuplicates,
  isScanning
}) {
  const totalStorage = stats.reduce((sum, s) => sum + s.totalBytes, 0);
  const totalDuplicatesStorage = stats.reduce((sum, s) => sum + s.duplicateBytes, 0);
  const totalFiles = stats.reduce((sum, s) => sum + s.totalFiles, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Total Storage Indexed</span>
            <HardDrive className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {formatBytes(totalStorage)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Across {stats.length} monitored shares ({totalFiles.toLocaleString()} files)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Redundant Storage</span>
            <Layers className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-300">
            {formatBytes(totalDuplicatesStorage)}
          </div>
          <div className="text-xs text-rose-400/80 mt-1">
            {totalStorage > 0 ? `${((totalDuplicatesStorage / totalStorage) * 100).toFixed(1)}% of total storage is duplicated` : '0% duplicated'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase">
            <span>Unique Data Assets</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-300">
            {formatBytes(Math.max(0, totalStorage - totalDuplicatesStorage))}
          </div>
          <div className="text-xs text-emerald-400/80 mt-1">
            Protected single-instance data
          </div>
        </div>
      </div>

      {/* Per Share Breakdown Table & Progress Bars */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Directory & Share Storage Breakdown
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Compare duplicate density and recoverable disk capacity per volume
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-800/70">
          {stats.map((share) => {
            const dupPercent = Number(share.duplicatePercentage) || 0;
            const uniquePercent = Math.max(0, 100 - dupPercent);

            return (
              <div key={share.id} className="p-4 hover:bg-slate-850/40 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: share.color || '#6366f1' }}
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-100">
                        {share.label || share.path}
                      </div>
                      <div className="text-xs font-mono text-slate-400 mt-0.5 truncate max-w-lg" title={share.path}>
                        {share.path}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Last Scanned */}
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="text-slate-400">
                      Indexed: {formatDate(share.lastScannedAt)}
                    </span>
                    {(share.duplicateBytes > 0 || share.duplicateFiles > 0) && (
                      <button
                        onClick={() => onFilterDuplicates && onFilterDuplicates(share.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-sm shadow-indigo-600/30 flex items-center gap-1.5"
                        title={`Filter and decide duplicate copies for ${share.label || share.path}`}
                      >
                        <Layers className="w-3.5 h-3.5 text-indigo-200" />
                        <span>Filter Duplicates</span>
                      </button>
                    )}
                    <button
                      onClick={() => onScanLocation(share.id)}
                      disabled={isScanning}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                      title="Rescan Directory"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Rescan</span>
                    </button>
                    <button
                      onClick={() => onRemoveLocation(share.id)}
                      disabled={isScanning}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Remove Share"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar of Duplicates vs Unique */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">
                      Total: {formatBytes(share.totalBytes)} ({share.totalFiles.toLocaleString()} files)
                    </span>
                    <div className="flex items-center gap-4 text-[11px]">
                      <span
                        onClick={() => {
                          if ((share.duplicateBytes > 0 || share.duplicateFiles > 0) && onFilterDuplicates) {
                            onFilterDuplicates(share.id);
                          }
                        }}
                        className={`text-rose-400 flex items-center gap-1 ${
                          (share.duplicateBytes > 0 || share.duplicateFiles > 0)
                            ? 'cursor-pointer hover:text-rose-300 hover:underline'
                            : ''
                        }`}
                        title={(share.duplicateBytes > 0 || share.duplicateFiles > 0) ? `Click to filter and resolve duplicates for ${share.label || share.path}` : undefined}
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        {dupPercent}% Duplicates ({formatBytes(share.duplicateBytes)})
                      </span>
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {uniquePercent.toFixed(1)}% Unique ({formatBytes(share.uniqueBytes)})
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    <div
                      onClick={() => {
                        if ((share.duplicateBytes > 0 || share.duplicateFiles > 0) && onFilterDuplicates) {
                          onFilterDuplicates(share.id);
                        }
                      }}
                      className={`bg-rose-500 transition-all duration-300 ${
                        (share.duplicateBytes > 0 || share.duplicateFiles > 0)
                          ? 'cursor-pointer hover:brightness-125'
                          : ''
                      }`}
                      style={{ width: `${dupPercent}%` }}
                      title={(share.duplicateBytes > 0 || share.duplicateFiles > 0) ? `Duplicates: ${dupPercent}% (${formatBytes(share.duplicateBytes)}) - Click to filter and resolve` : `Duplicates: ${dupPercent}%`}
                    />
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ width: `${uniquePercent}%` }}
                      title={`Unique: ${uniquePercent}%`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
