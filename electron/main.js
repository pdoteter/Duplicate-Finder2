process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const dbService = require('./services/db');
const scanner = require('./services/scanner');
const comparator = require('./services/comparator');
const fileOps = require('./services/fileOps');

let mainWindow = null;

async function createWindow() {
  const dataDir = path.join(__dirname, '../data');
  await dbService.initDatabase(dataDir);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    title: 'Duplicate Finder — Multi-Share & Network Drives',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove default menu for a clean modern app look
  mainWindow.setMenuBarVisibility(false);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL(devServerUrl).catch(() => {
      // If dev server not yet ready, fall back to index.html if built
      const distIndex = path.join(__dirname, '../dist/index.html');
      mainWindow.loadFile(distIndex).catch(() => {
        setTimeout(() => mainWindow.loadURL(devServerUrl), 1000);
      });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    dbService.saveDatabase();
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  dbService.saveDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  // Folder selector dialog
  ipcMain.handle('dialog:select-folder', async (event, title = 'Select Folder or Network Share') => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'dontAddToRecent']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Locations management
  ipcMain.handle('locations:get', async () => {
    return dbService.getLocations();
  });

  ipcMain.handle('locations:scan-info', async (event, locationId) => {
    return dbService.getLocationScanInfo(locationId);
  });

  ipcMain.handle('locations:upsert', async (event, folderPath, label) => {
    return dbService.upsertLocation(folderPath, label);
  });

  ipcMain.handle('locations:update', async (event, locationId, updates) => {
    return dbService.updateLocation(locationId, updates);
  });

  ipcMain.handle('locations:remove', async (event, locationId) => {
    dbService.removeLocation(locationId);
    return true;
  });

  // Scanning
  ipcMain.handle('scan:start', async (event, locationId, computeHashes = true, concurrency = 4, scanMode = 'resume') => {
    const loc = dbService.queryOne('SELECT * FROM locations WHERE id = ?', [locationId]);
    if (!loc) throw new Error('Location not found');

    const result = await scanner.scanLocation(
      locationId,
      loc.path,
      (progressData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan:progress', progressData);
        }
      },
      computeHashes,
      concurrency,
      scanMode
    );

    return result;
  });

  ipcMain.handle('scan:start-all', async (event, locationIds, computeHashes = true, concurrency = 4, scanMode = 'resume') => {
    const result = await scanner.scanMultipleLocations(
      locationIds,
      (progressData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan:progress', progressData);
        }
      },
      computeHashes,
      concurrency,
      scanMode
    );
    return result;
  });

  ipcMain.handle('scan:cancel', async () => {
    scanner.cancelScan();
    return true;
  });

  // Duplicate Finder & Analysis
  ipcMain.handle('duplicates:find', async (event, locationIds, options) => {
    return comparator.findDuplicates(locationIds, options);
  });

  ipcMain.handle('duplicates:unique-files', async (event, targetLocationId, compareLocationIds, options) => {
    return comparator.getUniqueFiles(targetLocationId, compareLocationIds, options);
  });

  ipcMain.handle('duplicates:stats', async (event, locationIds) => {
    return comparator.getLocationsStats(locationIds);
  });

  ipcMain.handle('duplicates:smart-select-all', async (event, locationIds, ruleType, options) => {
    return comparator.computeSmartSelection(locationIds, ruleType, options);
  });

  // Ignored Duplicate Sets
  ipcMain.handle('duplicates:ignore-set', async (event, fileSize, quickHash, fileName) => {
    return dbService.ignoreSet(fileSize, quickHash, fileName);
  });

  ipcMain.handle('duplicates:unignore-set', async (event, fileSize, quickHash) => {
    return dbService.unignoreSet(fileSize, quickHash);
  });

  ipcMain.handle('duplicates:clear-ignored-sets', async () => {
    return dbService.clearIgnoredSets();
  });

  ipcMain.handle('duplicates:get-ignored-sets', async () => {
    return dbService.getIgnoredSets();
  });

  // Ignored Directories
  ipcMain.handle('duplicates:preview-ignore-directory', async (event, locationId, directoryPath, activeLocationIds) => {
    return dbService.previewIgnoreDirectory(locationId, directoryPath, activeLocationIds);
  });

  ipcMain.handle('duplicates:ignore-directory', async (event, locationId, directoryPath, activeLocationIds) => {
    return dbService.ignoreDirectory(locationId, directoryPath, activeLocationIds);
  });

  ipcMain.handle('duplicates:unignore-directory', async (event, locationId, directoryPath) => {
    return dbService.unignoreDirectory(locationId, directoryPath);
  });

  ipcMain.handle('duplicates:get-ignored-directories', async () => {
    return dbService.getIgnoredDirectories();
  });

  // File operations & Trashing
  ipcMain.handle('duplicates:delete-single', async (event, fileId, options) => {
    return await fileOps.deleteFile(fileId, options);
  });

  ipcMain.handle('duplicates:delete-batch', async (event, fileIds, options) => {
    return await fileOps.deleteFilesBatch(fileIds, options);
  });

  ipcMain.handle('file:reveal-explorer', async (event, filePath) => {
    return fileOps.revealInExplorer(filePath);
  });

  ipcMain.handle('file:open', async (event, filePath) => {
    return await fileOps.openFile(filePath);
  });

  // Settings
  ipcMain.handle('settings:get', async (event, key, defaultValue) => {
    return dbService.getSetting(key, defaultValue);
  });

  ipcMain.handle('settings:set', async (event, key, value) => {
    dbService.setSetting(key, value);
    return true;
  });

  // Excluded extensions & DB cleanup
  ipcMain.handle('exclusions:get', async () => {
    return dbService.getExcludedExtensions();
  });

  ipcMain.handle('exclusions:set', async (event, extensions) => {
    return dbService.setExcludedExtensions(extensions);
  });
}
