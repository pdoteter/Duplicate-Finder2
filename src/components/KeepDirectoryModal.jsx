import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderCheck, 
  Folder, 
  ShieldCheck, 
  Loader2, 
  HardDrive, 
  X, 
  Trash2, 
  CheckCircle2, 
  Sparkles 
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function KeepDirectoryModal({
  isOpen,
  onClose,
  targetFile,
  activeLocationIds = [],
  onConfirm
}) {
  const [selectedPath, setSelectedPath] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openDeleteImmediately, setOpenDeleteImmediately] = useState(false);

  // Build hierarchy options if target has multiple folder segments
  const pathOptions = useMemo(() => {
    if (!targetFile) return [];
    if (targetFile.isRoot || !targetFile.dirPath) {
      return [{ path: '', label: '[Share Root Folder]', isDirect: true }];
    }

    const segments = targetFile.dirSegments || targetFile.dirPath.split('/').filter(Boolean);
    const options = [];

    // From most specific (deepest) to top-level folder
    for (let i = segments.length; i >= 1; i--) {
      const p = segments.slice(0, i).join('/');
      const isDirect = i === segments.length;
      options.push({
        path: p,
        label: p,
        folderName: segments[i - 1],
        isDirect
      });
    }

    // Also offer Share Root
    options.push({
      path: '',
      label: '[Share Root Folder]',
      folderName: 'Root',
      isDirect: false
    });

    return options;
  }, [targetFile]);

  // Initialize selected path whenever targetFile changes
  useEffect(() => {
    if (targetFile) {
      setSelectedPath(targetFile.isRoot ? '' : (targetFile.dirPath || ''));
      setPreviewData(null);
      setOpenDeleteImmediately(false);
    }
  }, [targetFile]);

  // Fetch preview whenever selectedPath or targetFile changes
  useEffect(() => {
    if (!isOpen || !targetFile || !window.api?.previewKeepDirectory) return;

    let isMounted = true;
    setIsLoadingPreview(true);

    window.api.previewKeepDirectory(targetFile.location_id, selectedPath, activeLocationIds)
      .then((data) => {
        if (isMounted) {
          setPreviewData(data);
          setIsLoadingPreview(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to preview keep directory:', err);
          setIsLoadingPreview(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, targetFile, selectedPath, activeLocationIds]);

  if (!isOpen || !targetFile) return null;

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setIsSubmitting(true);
    try {
      await onConfirm(targetFile.location_id, selectedPath, openDeleteImmediately);
      onClose();
    } catch (err) {
      console.error('Failed to keep directory:', err);
      alert(`Failed to keep directory: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const locationLabel = targetFile.location_label || targetFile.location_path || `Share ${targetFile.location_id}`;
  const locationColor = targetFile.location_color || '#6366f1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <FolderCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Keep This Directory
              </h3>
              <p className="text-xs text-slate-400">
                Keep the copies in this directory and select duplicates elsewhere for deletion
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Location Badge */}
          <div className="flex items-center gap-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
            <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-slate-400 font-medium">Target Share:</span>
            <span
              className="px-2 py-0.5 rounded text-xs font-semibold border inline-flex items-center gap-1"
              style={{
                backgroundColor: `${locationColor}20`,
                borderColor: `${locationColor}50`,
                color: locationColor
              }}
            >
              {locationLabel}
            </span>
            <span className="text-slate-500 font-mono text-[11px] truncate flex-1" title={targetFile.location_path}>
              {targetFile.location_path}
            </span>
          </div>

          {/* Directory Hierarchy Chooser (if multiple segments) */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold flex items-center justify-between">
              <span>Directory Scope to Keep:</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Includes all subdirectories and duplicate files within
              </span>
            </label>

            {pathOptions.length > 1 ? (
              <div className="space-y-1.5 bg-slate-950/40 p-2 rounded-xl border border-slate-800 max-h-48 overflow-y-auto">
                {pathOptions.map((opt) => {
                  const isChecked = selectedPath === opt.path;
                  return (
                    <label
                      key={opt.path || '__root__'}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border ${
                        isChecked
                          ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-200'
                          : 'bg-slate-900/40 hover:bg-slate-800/60 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="keep_dir_scope"
                        checked={isChecked}
                        onChange={() => setSelectedPath(opt.path)}
                        className="text-emerald-500 bg-slate-800 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <Folder className={`w-4 h-4 shrink-0 ${isChecked ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1 font-mono text-[11px]">
                        <span className="font-semibold">{opt.path || '[Share Root Folder]'}</span>
                        {opt.isDirect && (
                          <span className="ml-2 px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-sans font-bold">
                            Exact Row Folder
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 font-mono text-slate-200 flex items-center gap-2">
                <Folder className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{selectedPath || '[Share Root Folder]'}</span>
              </div>
            )}
          </div>

          {/* Impact Preview Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Duplicate Sets in this folder:</span>
              {isLoadingPreview ? (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculating duplicate sets...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-xs">
                    {(previewData?.setsCount || 0).toLocaleString()} duplicate sets
                  </span>
                </div>
              )}
            </div>

            {/* Metric Grid */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                <div className="text-[10px] text-emerald-400/80 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Kept Safe
                </div>
                <div className="text-sm font-bold text-emerald-200 mt-1">
                  {(previewData?.keptFilesCount || 0).toLocaleString()} files
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">In this directory</div>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40">
                <div className="text-[10px] text-rose-400/80 font-medium flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" />
                  To Delete
                </div>
                <div className="text-sm font-bold text-rose-200 mt-1">
                  {(previewData?.deleteFilesCount || 0).toLocaleString()} files
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">In other folders</div>
              </div>

              <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-900/40">
                <div className="text-[10px] text-indigo-400/80 font-medium flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Recoverable
                </div>
                <div className="text-sm font-bold text-indigo-200 mt-1">
                  {formatBytes(previewData?.deleteBytes || 0)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Disk space freed</div>
              </div>
            </div>

            {/* Explanation banner */}
            <div className="p-3 bg-emerald-950/20 rounded-lg border border-emerald-900/40 text-emerald-300/90 text-xs space-y-1">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-200">
                    The copy of every duplicate file in this directory will be preserved.
                  </p>
                  <p className="text-[11px] text-emerald-300/80 mt-1">
                    All duplicate copies located in other directories and shares will be selected for deletion (quarantine/trash). You can review every selected file before final deletion.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick delete review toggle */}
            <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/50 border border-slate-800/80 cursor-pointer text-slate-300 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={openDeleteImmediately}
                onChange={(e) => setOpenDeleteImmediately(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] font-medium">
                Open Delete review modal immediately after selecting duplicates
              </span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || isLoadingPreview || (previewData && previewData.setsCount === 0)}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Applying Keep Directory...</span>
              </>
            ) : (
              <>
                <FolderCheck className="w-3.5 h-3.5" />
                <span>
                  Keep Directory {previewData ? `(Select ${previewData.deleteFilesCount.toLocaleString()} duplicates)` : ''}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
