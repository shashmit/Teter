'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  FolderOpen,
  FolderClosed,
  Plus,
  FolderPlus,
  FilePlus,
  X,
  Link2,
  Copy,
  Save,
  Trash2,
  ChevronRight,
  Code2,
  Pencil,
  Eye,
} from 'lucide-react';

export interface CodeFile {
  id: string;
  name: string;
  content: string;
}

interface EditorProps {
  initialFiles?: CodeFile[];
  snippetId?: string;
  isReadOnly?: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  id?: string;
  children: Record<string, TreeNode>;
}

function buildTree(files: CodeFile[]) {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };
  files.forEach(file => {
    const parts = file.name.split('/');
    let current = root;
    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path,
          type: isLast ? 'file' : 'folder',
          id: isLast ? file.id : undefined,
          children: {}
        };
      }
      current = current.children[part];
    });
  });
  return root;
}

export default function Editor({ initialFiles, snippetId: initialSnippetId, isReadOnly: initialReadOnly = false }: EditorProps) {
  const router = useRouter();
  const [currentSnippetId, setCurrentSnippetId] = useState(initialSnippetId);
  const [isReadOnly, setIsReadOnly] = useState(initialReadOnly);
  const [files, setFiles] = useState<CodeFile[]>(
    initialFiles || [{ id: Date.now().toString(), name: 'main.txt', content: '' }]
  );
  const [activeFileId, setActiveFileId] = useState<string>(files[0]?.id || '');
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));

  const activeFile = files.find(f => f.id === activeFileId);
  const tree = useMemo(() => buildTree(files), [files]);

  const handleDragStart = (e: React.DragEvent, id: string, type: 'file' | 'folder', path: string) => {
    if (isReadOnly) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type, path }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      const { id, type, path: sourcePath } = data;
      if (type === 'file') {
        const fileToMove = files.find(f => f.id === id);
        if (fileToMove) {
          const fileName = fileToMove.name.split('/').pop() || fileToMove.name;
          const newName = targetPath ? `${targetPath}/${fileName}` : fileName;
          if (fileToMove.name !== newName) {
            setFiles(files.map(f => f.id === id ? { ...f, name: newName } : f));
          }
        }
      } else if (type === 'folder') {
        if (targetPath === sourcePath || targetPath.startsWith(sourcePath + '/')) {
          showToast("Cannot move a folder into itself");
          return;
        }
        const folderName = sourcePath.split('/').pop();
        const newFolderPath = targetPath ? `${targetPath}/${folderName}` : folderName;
        setFiles(files.map(f => {
          if (f.name.startsWith(sourcePath + '/')) {
            const restOfPath = f.name.substring(sourcePath.length);
            return { ...f, name: `${newFolderPath}${restOfPath}` };
          }
          if (f.name === sourcePath) {
            return { ...f, name: newFolderPath };
          }
          return f;
        }));
      }
    } catch (err) {
      console.error("Drop error:", err);
    }
  };

  const handleAddFolder = (parentPath: string = '') => {
    if (isReadOnly) return;
    const folderName = `new-folder-${Math.floor(Math.random() * 1000)}`;
    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    const newFile = { id: Date.now().toString(), name: `${fullPath}/new-file.txt`, content: '' };
    setFiles([...files, newFile]);
    const newExpanded = new Set(expandedFolders);
    if (parentPath) {
      parentPath.split('/').reduce((acc, part) => {
        const path = acc ? `${acc}/${part}` : part;
        newExpanded.add(path);
        return path;
      }, '');
    }
    newExpanded.add(fullPath);
    setExpandedFolders(newExpanded);
    setActiveFileId(newFile.id);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAddFile = (parentPath: string = '') => {
    if (isReadOnly) return;
    const fileName = `file-${files.length + 1}.txt`;
    const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const newFile = { id: Date.now().toString(), name: fullPath, content: '' };
    setFiles([...files, newFile]);
    const newExpanded = new Set(expandedFolders);
    if (parentPath) {
      parentPath.split('/').reduce((acc, part) => {
        const path = acc ? `${acc}/${part}` : part;
        newExpanded.add(path);
        return path;
      }, '');
    }
    setExpandedFolders(newExpanded);
    setActiveFileId(newFile.id);
  };

  const handleFileNameChange = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (isReadOnly) return;
    setFiles(files.map(f => f.id === id ? { ...f, name: e.target.value } : f));
  };

  const handleDeleteFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (files.length === 1) {
      showToast('Cannot delete the last file.');
      return;
    }
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);
    if (activeFileId === id) {
      setActiveFileId(newFiles[0].id);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    setFiles(files.map(f => f.id === activeFileId ? { ...f, content: e.target.value } : f));
  };

  const handleSave = async (isAuto = false) => {
    if (isReadOnly || (isSaving && !isAuto)) return;
    if (!isAuto) setIsSaving(true);
    try {
      if (currentSnippetId) {
        const response = await fetch(`/api/snippets/${currentSnippetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files })
        });
        if (!isAuto) {
          if (response.ok) showToast('Snippet updated');
          else showToast('Failed to update snippet');
        }
      } else {
        const response = await fetch('/api/snippets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files })
        });
        const data = await response.json();
        if (response.ok && data.id) {
          setCurrentSnippetId(data.id);
          window.history.replaceState(null, '', `/${data.id}`);
          if (!isAuto) showToast('Snippet saved');
        } else {
          if (!isAuto) showToast('Failed to save snippet');
        }
      }
    } catch (err) {
      if (!isAuto) showToast('Error saving snippet');
      console.error(err);
    } finally {
      if (!isAuto) setIsSaving(false);
    }
  };

  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isReadOnly || !currentSnippetId) return;
    const timer = setTimeout(() => {
      handleSave(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [files]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      showToast('Link copied to clipboard');
    }
  };

  const handleCopyCode = () => {
    if (activeFile?.content) {
      navigator.clipboard.writeText(activeFile.content);
      showToast('Code copied');
    }
  };

  const handleDeleteSnippet = async () => {
    if (!currentSnippetId) return;
    try {
      const response = await fetch(`/api/snippets/${currentSnippetId}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('Snippet deleted');
        setTimeout(() => router.push('/'), 1000);
      } else {
        showToast('Failed to delete');
      }
    } catch {
      showToast('Error deleting snippet');
    }
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderTreeNodes = (node: TreeNode, depth = 0) => {
    return Object.values(node.children)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(child => {
        if (child.type === 'folder') {
          const isExpanded = expandedFolders.has(child.path);
          return (
            <details key={child.path} open={isExpanded}>
              <summary
                onClick={(e) => { e.preventDefault(); toggleFolder(child.path); }}
                onDragStart={(e) => handleDragStart(e, child.id || '', 'folder', child.path)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, child.path)}
                draggable={!isReadOnly}
              >
                <span className="folder-icon">
                  <ChevronRight
                    size={14}
                    style={{
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 180ms ease',
                      marginRight: 2
                    }}
                  />
                  {isExpanded ? <FolderOpen size={15} /> : <FolderClosed size={15} />}
                </span>
                <span style={{ flex: 1 }}>{child.name}</span>
                {!isReadOnly && (
                  <span style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                    <button
                      className="btn btn-ghost-danger"
                      onClick={(e) => { e.stopPropagation(); handleAddFile(child.path); }}
                      title="Add file"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <FilePlus size={13} />
                    </button>
                    <button
                      className="btn btn-ghost-danger"
                      onClick={(e) => { e.stopPropagation(); handleAddFolder(child.path); }}
                      title="Add folder"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <FolderPlus size={13} />
                    </button>
                  </span>
                )}
              </summary>
              <ul>
                {renderTreeNodes(child, depth + 1)}
              </ul>
            </details>
          );
        } else {
          const isActive = activeFileId === child.id;
          return (
            <li key={child.id}>
              <div
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveFileId(child.id!)}
                draggable={!isReadOnly}
                onDragStart={(e) => handleDragStart(e, child.id!, 'file', child.path)}
                onDragOver={handleDragOver}
                onDrop={(e) => {
                  const parentPath = child.path.split('/').slice(0, -1).join('/');
                  handleDrop(e, parentPath);
                }}
              >
                <span className="file-icon">
                  <FileText size={14} />
                </span>
                {isReadOnly || !isActive ? (
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {child.name.split('/').pop()}
                  </span>
                ) : (
                  <input
                    type="text"
                    className="file-name-input"
                    value={files.find(f => f.id === child.id)?.name.split('/').pop() || ''}
                    onChange={(e) => {
                      const parts = (files.find(f => f.id === child.id)?.name || '').split('/');
                      parts[parts.length - 1] = e.target.value;
                      handleFileNameChange(
                        { ...e, target: { ...e.target, value: parts.join('/') } } as unknown as React.ChangeEvent<HTMLInputElement>,
                        child.id!
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="filename.txt"
                  />
                )}
                {!isReadOnly && (
                  <button
                    className="btn btn-ghost-danger"
                    onClick={(e) => handleDeleteFile(e, child.id!)}
                    title="Delete file"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </li>
          );
        }
      });
  };

  const activeTabName = activeFile?.name.split('/').pop();

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="brand">
          <span className="brand-name">Teter</span>
        </div>

        <div className="sidebar-header">
          <span className="sidebar-title">Files</span>
          {!isReadOnly && (
            <div className="sidebar-actions">
              <button className="btn btn-icon" onClick={() => handleAddFile('')} title="New file">
                <FilePlus size={16} />
              </button>
              <button className="btn btn-icon" onClick={() => handleAddFolder('')} title="New folder">
                <FolderPlus size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="file-list-container">
          <ul
            className="tree-view"
            onDragOver={handleDragOver}
            onDrop={(e) => {
              if (e.target === e.currentTarget) {
                handleDrop(e, '');
              }
            }}
          >
            {renderTreeNodes(tree)}
          </ul>
        </div>
      </div>

      {/* Main Area */}
      <div className="main-area">
        <div className="top-bar">
          <div className="tab-list">
            {files.map(file => {
              const fileName = file.name.split('/').pop() || file.name;
              const isActive = file.id === activeFileId;
              return (
                <button
                  key={file.id}
                  className={`tab-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveFileId(file.id)}
                >
                  <FileText size={13} />
                  {fileName}
                  {!isReadOnly && files.length > 1 && (
                    <span
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(e as unknown as React.MouseEvent, file.id);
                      }}
                      title="Close"
                    >
                      <X size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="header-actions">
            {currentSnippetId && (
              <button className="btn btn-outline" onClick={handleCopyLink}>
                <Link2 size={14} />
                Share
              </button>
            )}

            <button className="btn btn-outline" onClick={handleCopyCode}>
              <Copy size={14} />
              Copy
            </button>

            {currentSnippetId && (
              <button
                className={`btn ${isReadOnly ? 'btn-outline' : 'btn-outline'}`}
                onClick={() => setIsReadOnly(!isReadOnly)}
                title={isReadOnly ? 'Switch to edit mode' : 'Switch to view mode'}
              >
                {isReadOnly ? <Pencil size={14} /> : <Eye size={14} />}
                {isReadOnly ? 'Edit' : 'Viewing'}
              </button>
            )}

            {!isReadOnly && (
              <button className="btn btn-primary" onClick={() => handleSave(false)} disabled={isSaving}>
                <Save size={14} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}

            {currentSnippetId && (
              <button className="btn btn-danger" onClick={handleDeleteSnippet}>
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="editor-area">
          <div className="editor-wrapper">
            {activeFile ? (
              <textarea
                className="code-textarea"
                value={activeFile.content}
                onChange={handleContentChange}
                readOnly={isReadOnly}
                placeholder="Paste your code here..."
                spellCheck={false}
              />
            ) : (
              <div className="hero-message">
                <Code2 size={48} strokeWidth={1} />
                <p>No file selected</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
