import React, { useState, useEffect } from 'react';
import { Filter, XCircle, Plus, X, Trash2, CheckCircle2, Sparkles, Database } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

const COMMON_PRESETS = [
  { ext: 'xmp', label: '.xmp (Adobe / GPS Sidecar)' },
  { ext: 'thm', label: '.thm (Camera Thumbnail)' },
  { ext: 'aae', label: '.aae (Apple Photo Edits)' },
  { ext: 'dop', label: '.dop (DxO Sidecar)' },
  { ext: 'pp3', label: '.pp3 (RawTherapee Sidecar)' },
  { ext: 'thumbs.db', label: 'Thumbs.db (Windows Cache)' },
  { ext: 'ds_store', label: '.DS_Store (macOS Metadata)' }
];

function normalizeInput(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/^\./, '');
}

export default function ExcludedExtensionsModal({
  isOpen,
  onClose,
  excludedExtensions = [],
  onSaveExclusions
}) {
  const [items, setItems] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [rawTextMode, setRawTextMode] = useState(false);
  const [rawTextValue, setRawTextValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [cleanupBanner, setCleanupBanner] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const normalized = Array.from(new Set((excludedExtensions || []).map(normalizeInput).filter(Boolean)));
      setItems(normalized);
      setRawTextValue(normalized.map(e => (e.includes('.') ? e : `.${e}`)).join(', '));
      setInputValue('');
      setCleanupBanner(null);
    }
  }, [isOpen, excludedExtensions]);

  if (!isOpen) return null;

  const applyUpdate = async (nextItems) => {
    const unique = Array.from(new Set(nextItems.map(normalizeInput).filter(Boolean)));
    setItems(unique);
    setRawTextValue(unique.map(e => (e.includes('.') ? e : `.${e}`)).join(', '));
    setIsSaving(true);
    try {
      const result = await onSaveExclusions(unique);
      if (result) {
        setCleanupBanner({
          removedFilesCount: result.removedFilesCount || 0,
          removedBytes: result.removedBytes || 0,
          timestamp: Date.now()
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFromInput = async (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;

    const parsed = inputValue
      .split(/[,;\s]+/)
      .map(normalizeInput)
      .filter(Boolean);

    if (parsed.length === 0) return;

    const nextItems = Array.from(new Set([...items, ...parsed]));
    setInputValue('');
    await applyUpdate(nextItems);
  };

  const handleRemoveItem = async (extToRemove) => {
    const nextItems = items.filter(item => item !== extToRemove);
    await applyUpdate(nextItems);
  };

  const handleTogglePreset = async (presetExt) => {
    if (items.includes(presetExt)) {
      await handleRemoveItem(presetExt);
    } else {
      await applyUpdate([...items, presetExt]);
    }
  };

  const handleSaveRawText = async () => {
    const parsed = rawTextValue
      .split(/[,;\s\n]+/)
      .map(normalizeInput)
      .filter(Boolean);
    await applyUpdate(parsed);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 w-full max-w-xl shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Filter className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Excluded File Extensions & Sidecars
              </h3>
              <p className="text-xs text-slate-400">
                Files matching these extensions are ignored during scans and automatically cleaned from the database
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

        {/* Live DB Cleanup Feedback Banner */}
        {cleanupBanner && (
          <div className="flex items-center justify-between gap-2 bg-emerald-950/50 border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {cleanupBanner.removedFilesCount > 0 ? (
                <span>
                  Cleaned <strong>{cleanupBanner.removedFilesCount.toLocaleString()}</strong> matching files ({formatBytes(cleanupBanner.removedBytes)}) from the SQLite database — no rescan needed!
                </span>
              ) : (
                <span>
                  Exclusions saved and database verified (0 matching files needed removal).
                </span>
              )}
            </div>
          </div>
        )}

        {/* Mode Toggle: Tag View vs Raw Text Editor */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            Active Exclusions ({items.length})
          </span>
          <button
            type="button"
            onClick={() => {
              if (!rawTextMode) {
                setRawTextValue(items.map(e => (e.includes('.') ? e : `.${e}`)).join(', '));
              }
              setRawTextMode(!rawTextMode);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
          >
            {rawTextMode ? 'Switch to Tag View' : 'Edit as Comma-Separated Text'}
          </button>
        </div>

        {rawTextMode ? (
          <div className="flex flex-col gap-2.5">
            <textarea
              rows={3}
              value={rawTextValue}
              onChange={(e) => setRawTextValue(e.target.value)}
              placeholder=".xmp, .thm, .aae, thumbs.db"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveRawText}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {isSaving ? 'Cleaning DB...' : 'Apply & Clean Database'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Add Extension Input */}
            <form onSubmit={handleAddFromInput} className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Add extension (e.g. .xmp, .thm, .log) and press Enter..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="submit"
                disabled={isSaving || !inputValue.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add & Clean DB
              </button>
            </form>

            {/* Current Excluded Chips */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 min-h-[68px] flex flex-wrap items-center gap-2">
              {items.length === 0 ? (
                <span className="text-xs text-slate-500 italic">
                  No file extensions currently excluded.
                </span>
              ) : (
                items.map((ext) => (
                  <span
                    key={ext}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-semibold"
                  >
                    {ext.includes('.') ? ext : `.${ext}`}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(ext)}
                      disabled={isSaving}
                      title={`Stop excluding .${ext}`}
                      className="text-indigo-400 hover:text-rose-400 transition-colors p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </>
        )}

        {/* Quick Presets */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Quick Toggle Common Sidecar & System Files:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_PRESETS.map((preset) => {
              const active = items.includes(preset.ext);
              return (
                <button
                  key={preset.ext}
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleTogglePreset(preset.ext)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                    active
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {active ? '✓ ' : '+ '}
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-400">
            Adding an extension immediately removes matching entries from SQLite cache.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
