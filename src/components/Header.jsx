import React, { useState } from 'react';
import { 
  FolderPlus, 
  RefreshCw, 
  HardDrive, 
  Database, 
  Trash2, 
  CheckSquare, 
  Square, 
  Settings2,
  FolderSync,
  Layers,
  Sparkles,
  Zap,
  PlayCircle,
  Filter
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

export default function Header({
  locations = [],
  activeLocationIds = [],
  onToggleLocation,
  onAddLocation,
  onRemoveLocation,
  onScanLocation,
  onScanAll,
  isScanning,
  currentScanProgress,
  activeTab,
  onTabChange,
  scanThreads = 4,
  onScanThreadsChange,
  excludedExtensions = [],
  onOpenExclusions
}) {
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');

  const allSelected = locations.length > 0 && locations.every(l => activeLocationIds.includes(l.id));

  const handleToggleAll = () => {
    if (allSelected) {
      // Don't deselect all if it leaves 0, or deselect all
      locations.forEach(l => {
        if (activeLocationIds.includes(l.id)) {
          onToggleLocation(l.id, false);
        }
      });
    } else {
      locations.forEach(l => {
        if (!activeLocationIds.includes(l.id)) {
          onToggleLocation(l.id, true);
        }
      });
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col gap-4 shadow-xl shrink-0">
      {/* Top Bar: Brand, Navigation Tabs, Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/20 text-indigo-400 p-2.5 rounded-xl border border-indigo-500/30 shadow-inner">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Multi-Share Duplicate Finder
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Network Drive Scanner
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Compare multiple directories & network shares simultaneously to safely locate and clean duplicate files
            </p>
          </div>
        </div>

        {/* View Navigation Tabs */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onTabChange('DUPLICATES')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'DUPLICATES'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Duplicate Groups
          </button>
          <button
            onClick={() => onTabChange('UNIQUE')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'UNIQUE'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unique Files
          </button>
          <button
            onClick={() => onTabChange('STATS')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'STATS'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Share Analytics
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Excluded Extensions Button */}
          <button
            type="button"
            onClick={onOpenExclusions}
            className="flex items-center gap-1.5 bg-slate-950/80 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-indigo-500/40 text-xs text-slate-300 transition-colors"
            title="Edit excluded file extensions (automatically cleans database on add)"
          >
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] text-slate-400">Excluded:</span>
            <span className="font-mono font-semibold text-indigo-300 max-w-[140px] truncate">
              {excludedExtensions.length === 0
                ? 'None'
                : excludedExtensions.slice(0, 3).map(e => (e.includes('.') ? e : `.${e}`)).join(', ') +
                  (excludedExtensions.length > 3 ? ` +${excludedExtensions.length - 3}` : '')}
            </span>
          </button>

          {/* Thread Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] text-slate-400">Threads:</span>
            <select
              value={scanThreads}
              onChange={(e) => onScanThreadsChange && onScanThreadsChange(Number(e.target.value))}
              disabled={isScanning}
              className="bg-transparent text-indigo-300 font-semibold text-xs focus:outline-none cursor-pointer"
              title="Number of concurrent access threads used to scan and hash files"
            >
              <option value={1} className="bg-slate-900 text-slate-200">1 (Sequential)</option>
              <option value={2} className="bg-slate-900 text-slate-200">2 Threads</option>
              <option value={4} className="bg-slate-900 text-indigo-400 font-bold">4 Threads (Fast)</option>
              <option value={8} className="bg-slate-900 text-slate-200">8 Threads (Turbo)</option>
            </select>
          </div>

          <button
            onClick={onAddLocation}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition-colors disabled:opacity-50"
          >
            <FolderPlus className="w-4 h-4 text-indigo-400" />
            Add Directory / Share
          </button>

          <button
            onClick={onScanAll}
            disabled={isScanning || activeLocationIds.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Selected'}
          </button>
        </div>
      </div>

      {/* Directory Chips & Filter Bar */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Monitored Directories ({locations.length})
            </span>
            {locations.length > 1 && (
              <button
                onClick={handleToggleAll}
                className="text-[11px] text-slate-400 hover:text-indigo-300 transition-colors flex items-center gap-1 ml-2"
              >
                {allSelected ? <CheckSquare className="w-3 h-3 text-indigo-400" /> : <Square className="w-3 h-3" />}
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-1">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Offline SQLite Cache</span>
            </div>
            <span>•</span>
            <span>{activeLocationIds.length} active in comparison</span>
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
            No directories added yet. Click <span className="text-indigo-400 font-semibold cursor-pointer" onClick={onAddLocation}>"Add Directory / Share"</span> to begin comparing your network drives or folders.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {locations.map((loc) => {
              const isActive = activeLocationIds.includes(loc.id);
              const color = loc.color || '#6366f1';

              return (
                <div
                  key={loc.id}
                  className={`border rounded-lg p-2.5 flex items-start justify-between gap-2.5 transition-all ${
                    isActive
                      ? 'bg-slate-900 border-slate-700/90 shadow-sm'
                      : 'bg-slate-950/40 border-slate-800/50 opacity-60 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* Active Checkbox */}
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => onToggleLocation(loc.id, e.target.checked)}
                      className="mt-1 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      title={isActive ? 'Exclude from comparison' : 'Include in comparison'}
                    />

                    {/* Color Tag & Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: color }} 
                        />
                        <span className="text-xs font-semibold text-slate-200 truncate max-w-[130px]" title={loc.label || loc.path}>
                          {loc.label || loc.path}
                        </span>
                        {loc.scan_status === 'cancelled' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Paused
                          </span>
                        )}
                        {loc.scan_status === 'completed' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Indexed
                          </span>
                        )}
                      </div>
                      
                      <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={loc.path}>
                        {loc.path}
                      </div>

                      <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>{loc.total_files.toLocaleString()} files</span>
                        <span>•</span>
                        <span>{formatBytes(loc.total_size)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Scan & Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onScanLocation(loc.id)}
                      disabled={isScanning}
                      title={loc.scan_status === 'cancelled' ? 'Resume scan' : 'Scan options'}
                      className={`p-1 rounded transition-colors disabled:opacity-40 ${
                        loc.scan_status === 'cancelled'
                          ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40'
                          : 'text-slate-400 hover:text-indigo-300 hover:bg-slate-800'
                      }`}
                    >
                      {loc.scan_status === 'cancelled' ? (
                        <PlayCircle className="w-3.5 h-3.5" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveLocation(loc.id)}
                      disabled={isScanning}
                      title="Remove from comparator"
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
