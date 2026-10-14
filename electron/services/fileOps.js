const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const dbService = require('./db');

/**
 * Safely move a file to a designated quarantine folder on its network share or local drive,
 * or send to Windows Recycle Bin / permanently delete if requested.
 * @param {number} fileId 
 * @param {object} options 
 * @param {'quarantine'|'trash'} [options.action='quarantine']
 * @param {string} [options.quarantineFolder='_duplicates_trash']
 * @param {string} [options.customQuarantinePath]
 * @param {boolean} [options.permanentIfNoTrash=false]
 */
async function deleteFile(fileId, options = {}) {
  const action = options.action || 'quarantine';
  const permanentIfNoTrash = Boolean(options.permanentIfNoTrash);
  const quarantineFolder = (options.quarantineFolder || '_duplicates_trash').trim();
  const customQuarantinePath = options.customQuarantinePath ? options.customQuarantinePath.trim() : '';

  const file = dbService.queryOne(`
    SELECT f.*, l.path as location_path 
    FROM files f 
    JOIN locations l ON f.location_id = l.id 
    WHERE f.id = ?
  `, [fileId]);

  if (!file) {
    throw new Error(`File record #${fileId} not found in database`);
  }

  const fullPath = path.join(file.location_path, file.relative_path);
  let destPath = null;

  if (fs.existsSync(fullPath)) {
    if (action === 'quarantine') {
      // Determine destination directory on the share / filesystem
      const targetBaseDir = customQuarantinePath || path.join(file.location_path, quarantineFolder);
      let targetFilePath = path.join(targetBaseDir, file.relative_path);

      // Avoid moving a file onto itself if source and destination are identical
      if (path.resolve(fullPath) !== path.resolve(targetFilePath)) {
        await fs.promises.mkdir(path.dirname(targetFilePath), { recursive: true });

        // Handle collision in quarantine folder
        if (fs.existsSync(targetFilePath)) {
          const parsed = path.parse(targetFilePath);
          const timestamp = Date.now();
          targetFilePath = path.join(parsed.dir, `${parsed.name}_${timestamp}${parsed.ext}`);
          let counter = 1;
          while (fs.existsSync(targetFilePath)) {
            targetFilePath = path.join(parsed.dir, `${parsed.name}_${timestamp}_${counter}${parsed.ext}`);
            counter++;
          }
        }

        try {
          // Instantaneous atomic rename on the same share
          await fs.promises.rename(fullPath, targetFilePath);
        } catch (err) {
          if (err.code === 'EXDEV') {
            // Cross-device link fallback (copy + unlink)
            await fs.promises.copyFile(fullPath, targetFilePath);
            await fs.promises.unlink(fullPath);
          } else {
            throw err;
          }
        }
        destPath = targetFilePath;
      }
    } else {
      // Recycle Bin / Permanent delete
      try {
        await shell.trashItem(fullPath);
      } catch (err) {
        if (permanentIfNoTrash) {
          await fs.promises.unlink(fullPath);
        } else {
          throw new Error(`Windows Recycle Bin is not supported on this network share (${err.message}). Use Quarantine to move safely.`);
        }
      }
    }
  }

  // Remove from SQLite files table and update location totals
  dbService.removeFile(fileId);

  return {
    success: true,
    fileId,
    fullPath,
    destPath,
    action,
    fileSize: file.file_size
  };
}

/**
 * Batch delete / quarantine multiple duplicate files safely.
 * @param {number[]} fileIds 
 * @param {object} options 
 */
async function deleteFilesBatch(fileIds = [], options = {}) {
  const results = [];
  const errors = [];
  let reclaimedBytes = 0;

  for (const fileId of fileIds) {
    try {
      const res = await deleteFile(fileId, options);
      results.push(res);
      reclaimedBytes += res.fileSize || 0;
    } catch (err) {
      errors.push({ fileId, error: err.message });
    }
  }

  return {
    success: errors.length === 0,
    deletedCount: results.length,
    reclaimedBytes,
    action: options.action || 'quarantine',
    results,
    errors
  };
}

/**
 * Open Windows Explorer and highlight the file or directory.
 */
function revealInExplorer(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(path.normalize(filePath));
    return true;
  }
  return false;
}

/**
 * Open file in default application.
 */
async function openFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(path.normalize(filePath));
    return true;
  }
  return false;
}

module.exports = {
  deleteFile,
  deleteFilesBatch,
  revealInExplorer,
  openFile
};
