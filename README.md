# Multi-Share Duplicate Finder (Network Drives & Multi-Directory Scanner)

A high-performance desktop application designed to compare **multiple directories and network shares (SMB / UNC / NAS)** simultaneously to locate, inspect, and safely clean duplicate files.

Instead of a rigid master-and-slave hierarchy, **Multi-Share Duplicate Finder** allows you to register any number of folders and network drives, indexes them into a fast local SQLite cache with progressive hashing, and provides smart group selection rules to reclaim storage safely.

---

## 🌟 Key Features

1. **Multi-Directory & Network Share Comparison**:
   - Compare 2, 3, 4, or more directories simultaneously.
   - Fully supports network UNC paths (`\\server\share\folder`), mapped drives (`Z:\`), and local storage.
   - Individual check-toggles to include or exclude any directory from the active comparison instantly.

2. **Cross-Directory vs. Same-Directory Scoping**:
   - 🌐 **Cross-Directory Duplicates**: Identifies identical files duplicated across 2 or more different shares.
   - 📁 **Same-Directory Duplicates**: Identifies redundant duplicates within the same folder or share.
   - 🔁 **All Duplicates**: Unified view with instant scope switching.

3. **Optimized for Network Drives (SMB / UNC / NAS)**:
   - **4-Thread Concurrent Access Pipeline**: Employs a non-blocking producer-consumer pipeline with 4 parallel access threads (configurable from 1 to 8 threads). Overlaps network I/O latency, directory traversal, and quick-hashing for a ~3.2x speedup on local drives and even higher throughput across network shares.
   - **Progressive Hashing**: Compares file sizes first, reads a 64 KB header + 64 KB tail sample for candidate matches, and hashes fully only when necessary—eliminating heavy network bottlenecks.
   - **Persistent SQLite Local Cache**: Indexed files are cached locally in SQLite (`data/backup_comparator.db`), enabling instant sorting, searching, and offline browsing without hammering network shares.
   - **On-Demand Refresh & Multi-Scan**: Scan individual shares or batch-scan all selected shares with real-time traversal progress.

4. **Duplicate Groups & Visual Directory Comparison Matrix**:
   - **Directory Comparison Matrix**: Side-by-side / tabular view of each copy in a set comparing Share, Full Directory Hierarchy with highlighted breadcrumbs, Organization Depth rating (e.g. `Depth 3 (Organized Archive)` vs `Depth 0 (Loose in Root)`), and Modified Dates.
   - **Smart Difference Insights**: Automatic explanation banner (e.g. *"1 copy in organized subfolder (3 levels deep), 2 loose in root folder"*).
   - **1-Click "Keep This Copy" Decision**: Instantly keep any copy in the matrix and mark all other redundant copies for deletion.
   - **Smart Selection Rules across 47,000+ Sets**:
     - *Keep Deepest (Most Organized)*: Automatically retains the file in the most structured/organized subfolder and selects loose root or shallow duplicates for deletion.
     - *Keep Newest / Oldest*: Standard timestamp rules.
     - *Keep in Share*: Retain copies on a preferred share.
     - *All Sets vs Current Page Toggle*: Apply selection rules across all 47,000+ sets in under a second using SQLite batch evaluation, or limit to the current page.
   - **Safety Guard**: Prevents selecting all copies in a group, ensuring you never accidentally delete every instance of a file.

5. **Multi-View Navigation**:
   - **Duplicate Groups (Main Tab)**: Grouped view, smart selection, search, sort by recoverable space, and batch trash.
   - **Unique Files Tab**: Inspect files that exist *only* on a specific share (no duplicate copy anywhere else), protecting irreplaceable assets before cleaning.
   - **Share Analytics Tab**: Storage breakdown, duplicate density percentage, and unique vs. duplicate visual progress bars per directory.

6. **Safe Deletion Actions**:
   - **Windows Recycle Bin Integration**: Safely moves confirmed duplicate copies to the Windows Recycle Bin using Electron's native `shell.trashItem`.
   - Optional fallback toggle for permanent removal on network shares that do not support the Recycle Bin.
   - Direct shortcuts to **Open File** or **Show in Windows Explorer**.

---

## 🚀 Getting Started

### Prerequisites
- Windows
- Node.js (v20+ or v24+)

### Launching the Desktop Application

1. **Build and Start Electron App**:
   ```powershell
   npm run build
   npm start
   ```

2. **Or run with Live Reloading (Development mode)**:
   ```powershell
   npm run electron:dev
   ```

### Running the Test Suite
To verify multi-share indexing, cross/same-directory scoping, unique files detection, and batch trashing:
```powershell
npm test
```

To benchmark and verify the 4-thread scan acceleration and hash integrity:
```powershell
npm run test:threads
```

---

## 🏗️ Project Architecture

```
d:\Projects\Duplicate-Finder2/
├── electron/
│   ├── main.js                             # Electron process lifecycle & multi-directory IPC handlers
│   ├── preload.js                          # Secure contextBridge API for the renderer
│   └── services/
│       ├── db.js                           # Embedded SQLite database (sql.js) + multi-share schema
│       ├── scanner.js                      # High-performance directory crawler & progressive hashing
│       ├── comparator.js                   # Multi-directory duplicate grouping & unique files engine
│       └── fileOps.js                      # Windows Recycle Bin trashing & Explorer integration
├── src/
│   ├── components/
│   │   ├── Header.jsx                      # Directory chips, color badges, active toggles, view tabs
│   │   ├── DuplicateSummaryBar.jsx         # Metric cards (recoverable space, cross/same sets)
│   │   ├── DuplicateGroupsList.jsx         # Accordion duplicate groups & smart selection toolbar
│   │   ├── UniqueFilesView.jsx             # Share-by-share unique files inspector
│   │   ├── ShareStatsView.jsx              # Storage breakdown & duplicate density analytics
│   │   ├── ScanModal.jsx                   # Multi-directory live traversal progress modal
│   │   └── DeleteConfirmModal.jsx          # Safe batch trash confirmation modal
│   ├── App.jsx                             # Main layout coordinator & state store
│   └── utils/
│       └── formatters.js                   # Byte size & timestamp formatting utilities
├── verify-multi-directory-duplicates.js    # Integration test suite
├── package.json
└── vite.config.js
```
