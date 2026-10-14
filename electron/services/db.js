const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL = null;
let db = null;
let dbFilePath = null;
let saveTimeout = null;

const LOCATION_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#f97316'  // Orange
];

async function initDatabase(storageDir) {
  if (db) return db;
  
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  dbFilePath = path.join(storageDir, 'backup_comparator.db');

  SQL = await initSqlJs();

  if (fs.existsSync(dbFilePath)) {
    try {
      const fileBuffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Failed to load existing database file, creating a fresh one:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Run schema creation
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'share',
      label TEXT,
      is_active INTEGER DEFAULT 1,
      color TEXT DEFAULT '#6366f1',
      last_scanned_at TEXT,
      total_files INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      scan_status TEXT DEFAULT 'not_scanned'
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_extension TEXT,
      file_size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      quick_hash TEXT,
      full_hash TEXT,
      scanned_at TEXT,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ignored_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_location_id INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      ignored_at TEXT NOT NULL,
      reason TEXT,
      FOREIGN KEY (backup_location_id) REFERENCES locations(id) ON DELETE CASCADE,
      UNIQUE(backup_location_id, relative_path)
    );

    CREATE INDEX IF NOT EXISTS idx_files_loc ON files(location_id);
    CREATE INDEX IF NOT EXISTS idx_files_relpath ON files(location_id, relative_path);
    CREATE INDEX IF NOT EXISTS idx_files_size ON files(file_size);
    CREATE INDEX IF NOT EXISTS idx_files_quickhash ON files(quick_hash);
    CREATE INDEX IF NOT EXISTS idx_files_fullhash ON files(full_hash);
    CREATE INDEX IF NOT EXISTS idx_files_size_hash ON files(file_size, quick_hash);
  `);

  // Safe migrations for existing databases
  try {
    db.run("ALTER TABLE locations ADD COLUMN is_active INTEGER DEFAULT 1;");
  } catch (_) {}
  try {
    db.run("ALTER TABLE locations ADD COLUMN color TEXT DEFAULT '#6366f1';");
  } catch (_) {}
  try {
    db.run("ALTER TABLE locations ADD COLUMN scan_status TEXT DEFAULT 'not_scanned';");
  } catch (_) {}

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (!db || !dbFilePath) return;
  try {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

function closeDatabase() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

function scheduleSave(delay = 1000) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveDatabase();
  }, delay);
}

// Helpers for prepared statements
function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  if (!db) return;
  if (params && params.length > 0) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

// Location management
function upsertLocation(locPath, label = null, role = 'share') {
  const normalized = path.normalize(locPath);
  const existing = queryOne('SELECT * FROM locations WHERE path = ?', [normalized]);
  const defaultLabel = label || path.basename(normalized) || normalized;

  if (existing) {
    execute('UPDATE locations SET label = COALESCE(?, label), role = ? WHERE id = ?', [defaultLabel, role, existing.id]);
    scheduleSave();
    return queryOne('SELECT * FROM locations WHERE id = ?', [existing.id]);
  } else {
    const existingCount = queryOne('SELECT COUNT(*) as count FROM locations');
    const colorIndex = (existingCount ? existingCount.count : 0) % LOCATION_COLORS.length;
    const color = LOCATION_COLORS[colorIndex];

    execute(
      'INSERT INTO locations (path, role, label, is_active, color) VALUES (?, ?, ?, 1, ?)',
      [normalized, role, defaultLabel, color]
    );
    scheduleSave();
    return queryOne('SELECT * FROM locations WHERE path = ?', [normalized]);
  }
}

function updateLocation(locationId, updates = {}) {
  const fields = [];
  const values = [];

  if (updates.label !== undefined) {
    fields.push('label = ?');
    values.push(updates.label);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }
  if (updates.scan_status !== undefined) {
    fields.push('scan_status = ?');
    values.push(updates.scan_status);
  }

  if (fields.length > 0) {
    values.push(locationId);
    execute(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`, values);
    scheduleSave();
  }

  return queryOne('SELECT * FROM locations WHERE id = ?', [locationId]);
}

function getLocationScanInfo(locationId) {
  const loc = queryOne('SELECT * FROM locations WHERE id = ?', [locationId]);
  if (!loc) return null;
  const stats = queryOne('SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size FROM files WHERE location_id = ?', [locationId]);
  const indexedCount = stats ? stats.count : 0;
  const indexedSize = stats ? stats.size : 0;
  return {
    ...loc,
    indexedFilesCount: indexedCount,
    indexedFilesSize: indexedSize,
    hasExistingFiles: indexedCount > 0,
    isResumable: indexedCount > 0 && loc.scan_status !== 'completed'
  };
}

function getLocations() {
  return queryAll('SELECT * FROM locations ORDER BY id ASC');
}

function removeLocation(locationId) {
  execute('DELETE FROM files WHERE location_id = ?', [locationId]);
  execute('DELETE FROM ignored_files WHERE backup_location_id = ?', [locationId]);
  execute('DELETE FROM locations WHERE id = ?', [locationId]);
  scheduleSave();
}

function removeFile(fileId) {
  const file = queryOne('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) return null;

  execute('DELETE FROM files WHERE id = ?', [fileId]);
  execute(
    'UPDATE locations SET total_files = MAX(0, total_files - 1), total_size = MAX(0, total_size - ?) WHERE id = ?',
    [file.file_size, file.location_id]
  );
  scheduleSave();
  return file;
}

function removeFiles(fileIds = []) {
  if (!fileIds || fileIds.length === 0) return [];
  const removed = [];
  for (const id of fileIds) {
    const file = removeFile(id);
    if (file) removed.push(file);
  }
  return removed;
}

// Ignored files tracking
function ignoreFile(backupLocationId, relativePath, reason = null) {
  const normalizedRelPath = relativePath.replace(/\\/g, '/');
  execute(
    'INSERT OR REPLACE INTO ignored_files (backup_location_id, relative_path, ignored_at, reason) VALUES (?, ?, ?, ?)',
    [backupLocationId, normalizedRelPath, new Date().toISOString(), reason]
  );
  scheduleSave();
  return true;
}

function unignoreFile(backupLocationId, relativePath) {
  const normalizedRelPath = relativePath.replace(/\\/g, '/');
  execute(
    'DELETE FROM ignored_files WHERE backup_location_id = ? AND relative_path = ?',
    [backupLocationId, normalizedRelPath]
  );
  scheduleSave();
  return true;
}

function getIgnoredFiles(backupLocationId) {
  return queryAll(
    'SELECT relative_path, ignored_at, reason FROM ignored_files WHERE backup_location_id = ? ORDER BY ignored_at DESC',
    [backupLocationId]
  );
}

// Settings
function getSetting(key, defaultValue = null) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  scheduleSave();
}

module.exports = {
  initDatabase,
  saveDatabase,
  closeDatabase,
  scheduleSave,
  queryAll,
  queryOne,
  execute,
  upsertLocation,
  updateLocation,
  getLocations,
  getLocationScanInfo,
  removeLocation,
  removeFile,
  removeFiles,
  ignoreFile,
  unignoreFile,
  getIgnoredFiles,
  getSetting,
  setSetting,
  getDb: () => db
};
