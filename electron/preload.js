const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Folder dialog
  selectFolder: (title) => ipcRenderer.invoke('dialog:select-folder', title),
  
  // Locations
  getLocations: () => ipcRenderer.invoke('locations:get'),
  getLocationScanInfo: (locationId) => ipcRenderer.invoke('locations:scan-info', locationId),
  upsertLocation: (folderPath, label) => ipcRenderer.invoke('locations:upsert', folderPath, label),
  updateLocation: (locationId, updates) => ipcRenderer.invoke('locations:update', locationId, updates),
  removeLocation: (locationId) => ipcRenderer.invoke('locations:remove', locationId),
  
  // Scanning
  startScan: (locationId, computeHashes = true, concurrency = 4, scanMode = 'resume') => 
    ipcRenderer.invoke('scan:start', locationId, computeHashes, concurrency, scanMode),
  startScanAll: (locationIds, computeHashes = true, concurrency = 4, scanMode = 'resume') => 
    ipcRenderer.invoke('scan:start-all', locationIds, computeHashes, concurrency, scanMode),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  onScanProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('scan:progress', handler);
    return () => ipcRenderer.removeListener('scan:progress', handler);
  },
  
  // Duplicate Finder & Analysis
  findDuplicates: (locationIds, options) => ipcRenderer.invoke('duplicates:find', locationIds, options),
  computeSmartSelection: (locationIds, ruleType, options) => 
    ipcRenderer.invoke('duplicates:smart-select-all', locationIds, ruleType, options),
  ignoreSet: (fileSize, quickHash, fileName) => 
    ipcRenderer.invoke('duplicates:ignore-set', fileSize, quickHash, fileName),
  unignoreSet: (fileSize, quickHash) => 
    ipcRenderer.invoke('duplicates:unignore-set', fileSize, quickHash),
  clearIgnoredSets: () => ipcRenderer.invoke('duplicates:clear-ignored-sets'),
  getIgnoredSets: () => ipcRenderer.invoke('duplicates:get-ignored-sets'),
  previewIgnoreDirectory: (locationId, directoryPath, activeLocationIds) => 
    ipcRenderer.invoke('duplicates:preview-ignore-directory', locationId, directoryPath, activeLocationIds),
  ignoreDirectory: (locationId, directoryPath, activeLocationIds) => 
    ipcRenderer.invoke('duplicates:ignore-directory', locationId, directoryPath, activeLocationIds),
  unignoreDirectory: (locationId, directoryPath) => 
    ipcRenderer.invoke('duplicates:unignore-directory', locationId, directoryPath),
  getIgnoredDirectories: () => ipcRenderer.invoke('duplicates:get-ignored-directories'),
  previewKeepDirectory: (locationId, directoryPath, activeLocationIds) =>
    ipcRenderer.invoke('duplicates:preview-keep-directory', locationId, directoryPath, activeLocationIds),
  keepDirectory: (locationId, directoryPath, activeLocationIds, options) =>
    ipcRenderer.invoke('duplicates:keep-directory', locationId, directoryPath, activeLocationIds, options),
  getUniqueFiles: (targetLocationId, compareLocationIds, options) => 
    ipcRenderer.invoke('duplicates:unique-files', targetLocationId, compareLocationIds, options),
  getLocationsStats: (locationIds) => ipcRenderer.invoke('duplicates:stats', locationIds),
  
  // File operations & deletion
  deleteSingleFile: (fileId, options) => ipcRenderer.invoke('duplicates:delete-single', fileId, options),
  deleteBatchFiles: (fileIds, options) => ipcRenderer.invoke('duplicates:delete-batch', fileIds, options),
  revealInExplorer: (filePath) => ipcRenderer.invoke('file:reveal-explorer', filePath),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  
  // Settings & Exclusions
  getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getExcludedExtensions: () => ipcRenderer.invoke('exclusions:get'),
  setExcludedExtensions: (extensions) => ipcRenderer.invoke('exclusions:set', extensions)
});
