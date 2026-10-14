import React from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  ArrowRightLeft, 
  FileWarning, 
  EyeOff,
  Files
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function DiffSummaryBar({ summary, activeFilter, onFilterChange }) {
  if (!summary) return null;

  const cards = [
    {
      id: 'MISSING_IN_MASTER',
      title: 'Missing in Master',
      count: summary.missingInMaster,
      subtext: formatBytes(summary.totalMissingBytes),
      desc: 'Exist only in backup — high risk of data loss',
      icon: AlertCircle,
      activeColor: 'ring-2 ring-rose-500 bg-rose-950/40 border-rose-600/50',
      normalColor: 'bg-rose-950/20 border-rose-900/40 hover:bg-rose-950/30 text-rose-200',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
    },
    {
      id: 'MODIFIED_CONFLICT',
      title: 'Conflicts / Modified',
      count: summary.conflicts,
      subtext: 'Same path, differing content',
      desc: 'Different size or modified date',
      icon: FileWarning,
      activeColor: 'ring-2 ring-amber-500 bg-amber-950/40 border-amber-600/50',
      normalColor: 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-950/30 text-amber-200',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    },
    {
      id: 'RELOCATED',
      title: 'Relocated in Master',
      count: summary.relocated,
      subtext: 'Matching hash at other path',
      desc: 'Moved or renamed files',
      icon: ArrowRightLeft,
      activeColor: 'ring-2 ring-sky-500 bg-sky-950/40 border-sky-600/50',
      normalColor: 'bg-sky-950/20 border-sky-900/40 hover:bg-sky-950/30 text-sky-200',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    },
    {
      id: 'EXACT_DUPLICATE',
      title: 'Exact Duplicates',
      count: summary.exactDuplicates,
      subtext: formatBytes(summary.totalDuplicateBytes),
      desc: 'Identical path & hash (safe to clean)',
      icon: CheckCircle,
      activeColor: 'ring-2 ring-emerald-500 bg-emerald-950/40 border-emerald-600/50',
      normalColor: 'bg-emerald-950/20 border-emerald-900/40 hover:bg-emerald-950/30 text-emerald-200',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    },
    {
      id: 'IGNORED',
      title: 'Ignored in Backup',
      count: summary.ignored || 0,
      subtext: formatBytes(summary.totalIgnoredBytes || 0),
      desc: 'Excluded from missing items',
      icon: EyeOff,
      activeColor: 'ring-2 ring-purple-500 bg-purple-950/40 border-purple-600/50',
      normalColor: 'bg-purple-950/20 border-purple-900/40 hover:bg-purple-950/30 text-purple-200',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    },
    {
      id: 'ALL',
      title: 'All Backup Files',
      count: summary.totalBackupFiles,
      subtext: 'Total analyzed in target',
      desc: 'Complete backup inventory',
      icon: Files,
      activeColor: 'ring-2 ring-slate-400 bg-slate-800 border-slate-600',
      normalColor: 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/50 text-slate-300',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 bg-slate-950/90 border-b border-slate-800 shrink-0">
      {cards.map((c) => {
        const Icon = c.icon;
        const isSelected = activeFilter === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onFilterChange(c.id)}
            className={`border rounded-xl p-3 text-left transition-all duration-150 flex flex-col justify-between cursor-pointer ${
              isSelected ? c.activeColor : c.normalColor
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {c.title}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${c.badgeColor}`}>
                {c.count.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs opacity-75 font-medium truncate">
              {c.subtext}
            </div>
          </button>
        );
      })}
    </div>
  );
}
