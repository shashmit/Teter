'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  FolderOpen,
  FolderClosed,
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
  Upload,
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
  const [openTabIds, setOpenTabIds] = useState<string[]>(files.map(f => f.id));
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [pendingUploadPath, setPendingUploadPath] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const activeFile = files.find(f => f.id === activeFileId);
  const tree = useMemo(() => buildTree(files), [files]);

  const handleDragStart = (e: React.DragEvent, id: string, type: 'file' | 'folder', path: string) => {
    if (isReadOnly) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type, path }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const expandPath = (path: string, target: Set<string>) => {
    if (!path) return;
    path.split('/').reduce((acc, part) => {
      const nextPath = acc ? `${acc}/${part}` : part;
      target.add(nextPath);
      return nextPath;
    }, '');
  };

  const getUniquePath = (desiredPath: string, existingPaths: Set<string>) => {
    if (!existingPaths.has(desiredPath)) {
      existingPaths.add(desiredPath);
      return desiredPath;
    }
    const pathParts = desiredPath.split('/');
    const fileName = pathParts.pop() || desiredPath;
    const parentPath = pathParts.join('/');
    const extensionIndex = fileName.lastIndexOf('.');
    const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
    const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : '';
    let counter = 1;
    let candidate = desiredPath;
    while (existingPaths.has(candidate)) {
      const candidateName = `${baseName} (${counter})${extension}`;
      candidate = parentPath ? `${parentPath}/${candidateName}` : candidateName;
      counter += 1;
    }
    existingPaths.add(candidate);
    return candidate;
  };

  const uploadFilesAtPath = async (uploadList: FileList | File[], targetPath: string) => {
    if (isReadOnly) return;
    const selectedFiles = Array.from(uploadList);
    if (!selectedFiles.length) return;
    const existingPaths = new Set(files.map(file => file.name));
    const nextExpanded = new Set(expandedFolders);
    expandPath(targetPath, nextExpanded);
    try {
      const uploadedFiles: CodeFile[] = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const rawRelativePath =
            'webkitRelativePath' in file && (file as File & { webkitRelativePath?: string }).webkitRelativePath
              ? (file as File & { webkitRelativePath?: string }).webkitRelativePath!
              : file.name;
          const sanitizedRelativePath = rawRelativePath
            .replace(/^\/+/, '')
            .split('/')
            .filter(Boolean)
            .join('/');
          const desiredPath = targetPath
            ? `${targetPath}/${sanitizedRelativePath}`
            : sanitizedRelativePath;
          const uniquePath = getUniquePath(desiredPath, existingPaths);
          const parent = uniquePath.split('/').slice(0, -1).join('/');
          expandPath(parent, nextExpanded);
          return {
            id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            name: uniquePath,
            content: await file.text(),
          };
        })
      );
      setFiles(prev => [...prev, ...uploadedFiles]);
      setExpandedFolders(nextExpanded);
      setOpenTabIds(prev => [...prev, ...uploadedFiles.map(f => f.id)]);
      setActiveFileId(uploadedFiles[0].id);
      showToast(
        uploadedFiles.length === 1
          ? `Uploaded ${uploadedFiles[0].name.split('/').pop()}`
          : `Uploaded ${uploadedFiles.length} files`
      );
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Failed to upload files');
    }
  };

  const handleUploadButtonClick = (targetPath: string = '') => {
    if (isReadOnly) return;
    setPendingUploadPath(targetPath);
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || !selected.length) return;
    await uploadFilesAtPath(selected, pendingUploadPath);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    try {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void uploadFilesAtPath(e.dataTransfer.files, targetPath);
        return;
      }
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
    setOpenTabIds(prev => [...prev, newFile.id]);
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
    setOpenTabIds(prev => [...prev, newFile.id]);
    setActiveFileId(newFile.id);
  };

  const handleFileNameChange = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (isReadOnly) return;
    setFiles(files.map(f => f.id === id ? { ...f, name: e.target.value } : f));
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTabs = openTabIds.filter(t => t !== id);
    setOpenTabIds(newTabs);
    if (activeFileId === id) {
      setActiveFileId(newTabs[newTabs.length - 1] || '');
    }
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

    const newTabs = openTabIds.filter(t => t !== id);
    setOpenTabIds(newTabs);

    if (activeFileId === id) {
      setActiveFileId(newTabs[newTabs.length - 1] || '');
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
          if (response.ok) {
            showToast('Snippet updated');
            setIsReadOnly(true);
          } else {
            showToast('Failed to update snippet');
          }
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
          if (!isAuto) {
            showToast('Snippet saved');
            setIsReadOnly(true);
          }
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
                    <button
                      className="btn btn-ghost-danger"
                      onClick={(e) => { e.stopPropagation(); handleUploadButtonClick(child.path); }}
                      title="Upload files here"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Upload size={13} />
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
                onClick={() => {
                  if (!openTabIds.includes(child.id!)) {
                    setOpenTabIds(prev => [...prev, child.id!]);
                  }
                  setActiveFileId(child.id!);
                }}
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
                  <>
                    <button
                      className="btn btn-ghost-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUploadButtonClick(child.path.split('/').slice(0, -1).join('/'));
                      }}
                      title="Upload files to this location"
                    >
                      <Upload size={12} />
                    </button>
                    <button
                      className="btn btn-ghost-danger"
                      onClick={(e) => handleDeleteFile(e, child.id!)}
                      title="Delete file"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        }
      });
  };

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
              <button className="btn btn-icon" onClick={() => handleUploadButtonClick('')} title="Upload files">
                <Upload size={16} />
              </button>
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
            {openTabIds.map(tabId => {
              const file = files.find(f => f.id === tabId);
              if (!file) return null;
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
                  <span
                    className="tab-close"
                    onClick={(e) => handleCloseTab(e as unknown as React.MouseEvent, file.id)}
                    title="Close"
                  >
                    <X size={10} />
                  </span>
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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  );
}
