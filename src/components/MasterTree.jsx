import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Layers, 
  HardDrive,
  FilterX
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

function TreeNode({ node, selectedPath, onSelectPath, level = 0, searchTerm = '' }) {
  const [isOpen, setIsOpen] = useState(level < 1); // Expand top level by default

  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedPath === node.path;

  // Filter check if searching
  const matchesSearch = !searchTerm || node.name.toLowerCase().includes(searchTerm.toLowerCase());
  const hasMatchingChild = (n) => {
    if (!searchTerm) return true;
    if (n.name.toLowerCase().includes(searchTerm.toLowerCase())) return true;
    return n.children && n.children.some(hasMatchingChild);
  };

  if (searchTerm && !matchesSearch && !hasMatchingChild(node)) {
    return null;
  }

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = () => {
    onSelectPath(node.path);
  };

  return (
    <div className="select-none text-xs">
      <div
        onClick={handleSelect}
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
          isSelected 
            ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 font-medium' 
            : 'text-slate-300 hover:bg-slate-800/60'
        }`}
        style={{ paddingLeft: `${Math.max(8, level * 16 + 8)}px` }}
      >
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="p-0.5 hover:bg-slate-700/60 rounded text-slate-400 hover:text-slate-200"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 inline-block" />
        )}

        {isOpen ? (
          <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-slate-400 shrink-0" />
        )}

        <span className="truncate flex-1" title={node.name}>
          {node.name}
        </span>

        <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
          {node.fileCount}
        </span>
      </div>

      {hasChildren && isOpen && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
              level={level + 1}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MasterTree({ treeData, selectedPath, onSelectPath, masterPath }) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <aside className="w-80 md:w-96 border-r border-slate-800 bg-slate-950 flex flex-col h-full shrink-0">
      {/* Pane Title & Active Scope */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Master Directory Structure
          </h2>
        </div>

        {selectedPath !== '' && (
          <button
            onClick={() => onSelectPath('')}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 border border-slate-700 transition"
            title="Clear folder filter and view all files"
          >
            <FilterX className="w-3 h-3 text-rose-400" />
            Show All
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-slate-800/80">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter folders..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Directory Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {treeData && treeData.children && treeData.children.length > 0 ? (
          <div>
            {/* Root item */}
            <div
              onClick={() => onSelectPath('')}
              className={`flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer mb-1 text-xs transition-colors ${
                selectedPath === '' 
                  ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 font-semibold' 
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="truncate">All Master Folders</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {formatBytes(treeData.totalSize)}
              </span>
            </div>

            {/* Subfolders */}
            {treeData.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                searchTerm={searchTerm}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 text-xs px-4">
            {masterPath ? (
              <p>Index the Master location to browse its directory hierarchy.</p>
            ) : (
              <p>Select a Master location to begin.</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      {selectedPath && (
        <div className="p-2 border-t border-slate-800 bg-slate-900/40 text-[11px] text-slate-400 truncate">
          Active Filter: <span className="text-indigo-300 font-mono">/{selectedPath}</span>
        </div>
      )}
    </aside>
  );
}
