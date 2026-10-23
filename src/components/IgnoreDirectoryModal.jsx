import React, { useState, useEffect } from 'react';
import { FolderX, Folder, EyeOff, Loader2, HardDrive, X, ArrowRight } from 'lucide-react';

export default function IgnoreDirectoryModal({
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

  // Build hierarchy options if target has multiple folder segments
  const pathOptions = React.useMemo(() => {
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

    return options;
  }, [targetFile]);

  // Initialize selected path whenever targetFile changes
  useEffect(() => {
    if (targetFile) {
      setSelectedPath(targetFile.isRoot ? '' : (targetFile.dirPath || ''));
      setPreviewData(null);
    }
  }, [targetFile]);

  // Fetch preview whenever selectedPath or targetFile changes
  useEffect(() => {
    if (!isOpen || !targetFile || !window.api?.previewIgnoreDirectory) return;

    let isMounted = true;
    setIsLoadingPreview(true);

    window.api.previewIgnoreDirectory(targetFile.location_id, selectedPath, activeLocationIds)
      .then((data) => {
        if (isMounted) {
          setPreviewData(data);
          setIsLoadingPreview(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to preview ignore directory:', err);
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
      await onConfirm(targetFile.location_id, selectedPath);
      onClose();
    } catch (err) {
      console.error('Failed to ignore directory:', err);
      alert(`Failed to ignore directory: ${err.message}`);
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
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <FolderX className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Ignore Directory
              </h3>
              <p className="text-xs text-slate-400">
                Move duplicate sets in this directory directly to Ignored
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
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
              <span>Directory Scope to Ignore:</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Includes all subdirectories and duplicate files within
              </span>
            </label>

            {pathOptions.length > 1 ? (
              <div className="space-y-1.5 bg-slate-950/40 p-2 rounded-xl border border-slate-800">
                {pathOptions.map((opt) => {
                  const isChecked = selectedPath === opt.path;
                  return (
                    <label
                      key={opt.path}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border ${
                        isChecked
                          ? 'bg-amber-950/30 border-amber-700/60 text-amber-200'
                          : 'bg-slate-900/40 hover:bg-slate-800/60 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="ignore_dir_scope"
                        checked={isChecked}
                        onChange={() => setSelectedPath(opt.path)}
                        className="text-amber-500 bg-slate-800 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <Folder className={`w-4 h-4 shrink-0 ${isChecked ? 'text-amber-400' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1 font-mono text-[11px]">
                        <span className="font-semibold">{opt.path || '[Root Folder]'}</span>
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
                <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold">{selectedPath || '[Share Root Folder]'}</span>
              </div>
            )}
          </div>

          {/* Impact Preview Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Duplicate Sets in this folder:</span>
              {isLoadingPreview ? (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculating...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-xs">
                    {(previewData?.setsCount || 0).toLocaleString()} duplicate sets
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    ({(previewData?.filesCount || 0).toLocaleString()} files)
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-950/20 rounded-lg border border-amber-900/40 text-amber-300/90 text-xs space-y-1">
              <div className="flex items-start gap-2">
                <EyeOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-200">
                    All matching duplicate sets will be moved to the <span className="font-bold underline">Ignored</span> tab.
                  </p>
                  <p className="text-[11px] text-amber-300/80 mt-1">
                    You do not need to click "Ignore Set" individually for each file. They will be excluded from active duplicates and Smart Select rules, and can be restored anytime from the Ignored tab.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || isLoadingPreview || (previewData && previewData.setsCount === 0)}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Ignoring Directory...</span>
              </>
            ) : (
              <>
                <FolderX className="w-3.5 h-3.5" />
                <span>
                  Ignore Directory {previewData ? `(${previewData.setsCount.toLocaleString()} sets)` : ''}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
