import React, { useState, useEffect } from 'react';
import { 
  FolderArchive, 
  Trash2, 
  AlertTriangle, 
  X, 
  ShieldCheck, 
  FolderOpen, 
  HardDrive, 
  Check, 
  FolderSync 
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  fileCount = 0,
  reclaimedBytes = 0,
  involvedLocations = [],
  isDeleting = false
}) {
  const [action, setAction] = useState('quarantine'); // 'quarantine' | 'trash'
  const [quarantineType, setQuarantineType] = useState('subfolder'); // 'subfolder' | 'custom'
  const [quarantineFolderName, setQuarantineFolderName] = useState('_duplicates_trash');
  const [customQuarantinePath, setCustomQuarantinePath] = useState('');
  const [permanentIfNoTrash, setPermanentIfNoTrash] = useState(false);

  // Load saved preferences on mount or open
  useEffect(() => {
    if (isOpen) {
      try {
        const savedAction = localStorage.getItem('df_quarantine_action');
        if (savedAction) setAction(savedAction);

        const savedFolder = localStorage.getItem('df_quarantine_folder');
        if (savedFolder) setQuarantineFolderName(savedFolder);

        const savedCustomPath = localStorage.getItem('df_custom_quarantine_path');
        if (savedCustomPath) setCustomQuarantinePath(savedCustomPath);
      } catch (_) {}

      if (window.api?.getSetting) {
        window.api.getSetting('quarantine_folder_name', '_duplicates_trash').then(val => {
          if (val) setQuarantineFolderName(val);
        }).catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBrowseCustomFolder = async () => {
    if (!window.api?.selectFolder) return;
    try {
      const selected = await window.api.selectFolder('Select Custom Quarantine Directory');
      if (selected) {
        setCustomQuarantinePath(selected);
        setQuarantineType('custom');
      }
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  };

  const handleConfirmAction = () => {
    if (action === 'quarantine') {
      const cleanFolder = quarantineFolderName.trim() || '_duplicates_trash';
      const cleanCustom = quarantineType === 'custom' ? customQuarantinePath.trim() : null;

      try {
        localStorage.setItem('df_quarantine_action', 'quarantine');
        localStorage.setItem('df_quarantine_folder', cleanFolder);
        if (cleanCustom) {
          localStorage.setItem('df_custom_quarantine_path', cleanCustom);
        }
        if (window.api?.setSetting) {
          window.api.setSetting('quarantine_folder_name', cleanFolder);
        }
      } catch (_) {}

      onConfirm({
        action: 'quarantine',
        quarantineFolder: cleanFolder,
        customQuarantinePath: cleanCustom
      });
    } else {
      try {
        localStorage.setItem('df_quarantine_action', 'trash');
      } catch (_) {}

      onConfirm({
        action: 'trash',
        permanentIfNoTrash
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-slate-200 max-h-[92vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 shrink-0">
          <div className="bg-emerald-500/15 text-emerald-400 p-3 rounded-xl border border-emerald-500/25 shrink-0">
            <FolderArchive className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              Process Duplicate Files
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose how you want to handle the redundant duplicate copies. At least one original copy of each file is always preserved.
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 mt-4 space-y-4 text-xs">
          {/* Impact Summary Box */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span>Files to process:</span>
              <span className="font-bold text-white font-mono">{fileCount.toLocaleString()} duplicate files</span>
            </div>
            <div className="flex justify-between text-slate-300 border-t border-slate-800/80 pt-2">
              <span>Reclaimed active storage:</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">{formatBytes(reclaimedBytes)}</span>
            </div>
            {involvedLocations.length > 0 && (
              <div className="border-t border-slate-800/80 pt-2">
                <span className="text-slate-400 text-[11px] block mb-1">Target share(s):</span>
                <div className="space-y-1">
                  {involvedLocations.map(loc => (
                    <div key={loc.id} className="flex items-center gap-1.5 text-[11px] text-slate-300 font-mono truncate">
                      <HardDrive className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{loc.label || loc.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Method Tabs / Cards */}
          <div className="space-y-3">
            <div className="text-slate-300 font-semibold text-xs flex items-center justify-between">
              <span>Select Cleanup Method:</span>
            </div>

            {/* Option 1: Safe Quarantine (Recommended) */}
            <div 
              onClick={() => setAction('quarantine')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                action === 'quarantine' 
                  ? 'bg-emerald-950/20 border-emerald-500/50 ring-1 ring-emerald-500/30' 
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="cleanupAction"
                  checked={action === 'quarantine'}
                  onChange={() => setAction('quarantine')}
                  className="mt-1 text-emerald-500 border-slate-700 bg-slate-900 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">
                      Move to Quarantine Folder on Share
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Recommended
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Instantly and safely moves duplicates to a designated folder on the same network share. 
                    Because it stays on the share, it performs a fast atomic move with zero heavy network file transfers.
                  </p>

                  {/* Folder Configuration when Quarantine is active */}
                  {action === 'quarantine' && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2.5">
                      {/* Sub-option A: Default folder on share root */}
                      <label className="flex items-start gap-2 cursor-pointer text-slate-300">
                        <input
                          type="radio"
                          name="quarantineType"
                          checked={quarantineType === 'subfolder'}
                          onChange={() => setQuarantineType('subfolder')}
                          className="mt-0.5 text-emerald-500 border-slate-700 bg-slate-900 focus:ring-0"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-xs">Folder on each share root:</span>
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="text"
                              value={quarantineFolderName}
                              onChange={(e) => setQuarantineFolderName(e.target.value)}
                              placeholder="_duplicates_trash"
                              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 w-56"
                            />
                            <span className="text-[11px] text-slate-500">e.g. `[Share Root]\{quarantineFolderName}`</span>
                          </div>
                        </div>
                      </label>

                      {/* Sub-option B: Custom Path */}
                      <label className="flex items-start gap-2 cursor-pointer text-slate-300 pt-1">
                        <input
                          type="radio"
                          name="quarantineType"
                          checked={quarantineType === 'custom'}
                          onChange={() => setQuarantineType('custom')}
                          className="mt-0.5 text-emerald-500 border-slate-700 bg-slate-900 focus:ring-0"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-xs">Specific custom directory:</span>
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="text"
                              value={customQuarantinePath}
                              onChange={(e) => setCustomQuarantinePath(e.target.value)}
                              placeholder="Choose or enter folder path..."
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={handleBrowseCustomFolder}
                              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-xs font-medium transition-colors shrink-0"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>Browse...</span>
                            </button>
                          </div>
                        </div>
                      </label>

                      {/* Safeguard Highlights */}
                      <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/80 space-y-1 text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>Original relative directory hierarchy is preserved inside quarantine</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Quarantine folders are automatically excluded from future duplicate scans</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Option 2: Windows Recycle Bin / Permanent Delete */}
            <div 
              onClick={() => setAction('trash')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                action === 'trash' 
                  ? 'bg-rose-950/20 border-rose-500/50 ring-1 ring-rose-500/30' 
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="cleanupAction"
                  checked={action === 'trash'}
                  onChange={() => setAction('trash')}
                  className="mt-1 text-rose-500 border-slate-700 bg-slate-900 focus:ring-0 cursor-pointer"
                />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">
                      Windows Recycle Bin / Permanent Delete
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Sends files to the Windows OS Recycle Bin. Note: Windows network shares (SMB/UNC) natively reject the Recycle Bin.
                  </p>

                  {action === 'trash' && (
                    <div className="mt-3 pt-3 border-t border-rose-900/30 space-y-2">
                      <div className="p-2.5 bg-amber-950/30 border border-amber-900/50 rounded-lg text-amber-200/90 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <label className="flex items-start gap-2 cursor-pointer font-medium select-none">
                            <input
                              type="checkbox"
                              checked={permanentIfNoTrash}
                              onChange={(e) => setPermanentIfNoTrash(e.target.checked)}
                              className="mt-0.5 rounded border-amber-800 bg-slate-900 text-amber-500 focus:ring-0"
                            />
                            <span>
                              Permanently delete if network share does not support Windows Recycle Bin
                            </span>
                          </label>
                          <p className="text-[10px] text-amber-300/70 mt-1 pl-5">
                            Warning: Irreversible. Files will be deleted directly from the network drive instead of moved.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          {action === 'quarantine' ? (
            <button
              onClick={handleConfirmAction}
              disabled={isDeleting || fileCount === 0}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <FolderSync className={`w-4 h-4 ${isDeleting ? 'animate-spin' : ''}`} />
              <span>{isDeleting ? 'Moving files to quarantine...' : `Move ${fileCount} Files to Quarantine`}</span>
            </button>
          ) : (
            <button
              onClick={handleConfirmAction}
              disabled={isDeleting || fileCount === 0}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {isDeleting 
                  ? 'Deleting files...' 
                  : permanentIfNoTrash 
                    ? `Permanently Delete ${fileCount} Files` 
                    : `Trash ${fileCount} Files`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
