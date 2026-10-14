import React from 'react';
import { 
  Layers, 
  Files, 
  Trash2, 
  Network, 
  FolderTree, 
  HardDrive
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function DuplicateSummaryBar({
  summary = {},
  activeScope = 'ALL',
  onScopeChange
}) {
  const cards = [
    {
      id: 'ALL',
      title: 'Total Duplicate Sets',
      value: (summary.totalGroups || 0).toLocaleString(),
      subtext: `${(summary.totalDuplicateFiles || 0).toLocaleString()} redundant copies`,
      desc: 'All duplicate groups found',
      icon: Layers,
      scopeValue: 'ALL',
      activeColor: 'ring-2 ring-indigo-500 bg-indigo-950/40 border-indigo-500/50',
      normalColor: 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 text-slate-300'
    },
    {
      id: 'WASTED_SPACE',
      title: 'Recoverable Space',
      value: formatBytes(summary.totalWastedBytes || 0),
      subtext: 'Safe to reclaim',
      desc: 'Redundant storage used',
      icon: Trash2,
      scopeValue: null, // stat card only
      activeColor: '',
      normalColor: 'bg-rose-950/20 border-rose-900/40 text-rose-200'
    },
    {
      id: 'CROSS_DIRECTORY',
      title: 'Cross-Directory Sets',
      value: (summary.crossDirectoryGroups || 0).toLocaleString(),
      subtext: formatBytes(summary.crossDirectoryWastedBytes || 0),
      desc: 'Spanning 2+ different shares',
      icon: Network,
      scopeValue: 'CROSS_DIRECTORY',
      activeColor: 'ring-2 ring-cyan-500 bg-cyan-950/40 border-cyan-500/50',
      normalColor: 'bg-cyan-950/20 border-cyan-900/40 hover:bg-cyan-950/30 text-cyan-200'
    },
    {
      id: 'DIFF_FOLDERS',
      title: 'Different Folders Sets',
      value: (summary.diffFolderGroups || 0).toLocaleString(),
      subtext: formatBytes(summary.diffFolderWastedBytes || 0),
      desc: 'Copies in differing folder paths',
      icon: FolderTree,
      scopeValue: 'DIFF_FOLDERS',
      activeColor: 'ring-2 ring-purple-500 bg-purple-950/40 border-purple-500/50',
      normalColor: 'bg-purple-950/20 border-purple-900/40 hover:bg-purple-950/30 text-purple-200'
    },
    {
      id: 'SAME_DIRECTORY',
      title: 'Same-Directory Sets',
      value: (summary.sameDirectoryGroups || 0).toLocaleString(),
      subtext: formatBytes(summary.sameDirectoryWastedBytes || 0),
      desc: 'Duplicates inside same share',
      icon: Files,
      scopeValue: 'SAME_DIRECTORY',
      activeColor: 'ring-2 ring-amber-500 bg-amber-950/40 border-amber-500/50',
      normalColor: 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-950/30 text-amber-200'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4 bg-slate-950/80 border-b border-slate-800 shrink-0">
      {cards.map((c) => {
        const Icon = c.icon;
        const isClickable = Boolean(c.scopeValue);
        const isSelected = isClickable && activeScope === c.scopeValue;

        const baseClasses = `border rounded-xl p-3 flex flex-col justify-between transition-all ${
          isSelected ? c.activeColor : c.normalColor
        } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`;

        return (
          <div
            key={c.id}
            onClick={() => {
              if (isClickable && onScopeChange) {
                onScopeChange(c.scopeValue);
              }
            }}
            className={baseClasses}
            role={isClickable ? 'button' : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {c.title}
              </span>
              {isClickable && isSelected && (
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </div>

            <div className="my-1.5">
              <div className="text-xl font-bold tracking-tight text-white">
                {c.value}
              </div>
              <div className="text-[11px] opacity-75 font-medium truncate">
                {c.subtext}
              </div>
            </div>

            <div className="text-[10px] text-slate-400/80 border-t border-slate-800/40 pt-1 flex items-center justify-between">
              <span>{c.desc}</span>
              {isClickable && (
                <span className="text-[9px] text-indigo-400 opacity-90">
                  {isSelected ? 'Active Filter' : 'Filter'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
