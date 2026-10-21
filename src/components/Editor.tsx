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
  Copy,
  Save,
  Trash2,
  ChevronRight,
  Code2,
  Pencil,
  Eye,
  FileUp,
  FolderUp,
  Download,
  MoreVertical,
  WrapText,
  Plus,
  Upload,
  PanelLeft,
} from 'lucide-react';

import CodeEditor from '@/components/CodeEditor';
import MenuButton, { type MenuAction } from '@/components/MenuButton';
import SaveStatus, { type SaveState } from '@/components/SaveStatus';
import { flattenDropEntries, readDropEntries } from '@/lib/drop-files';
import { createZip, downloadBlob } from '@/lib/zip';
import {
  createFileBlob,
  formatFileSize,
  getFileBytes,
  getFileSize,
  readFileContent,
  type FileEncoding,
} from '@/lib/file-content';

export interface CodeFile {
  id: string;
  name: string;
  content: string;
  encoding?: FileEncoding;
  mimeType?: string;
  size?: number;
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

/**
 * Small snippets open with every file in a tab. Past this, only the first file
 * opens: hundreds of tabs are unusable and slow every render.
 */
const MAX_INITIAL_TABS = 8;

/** Splits a file's last path segment into the editable stem and its extension. */
function splitFileName(path: string) {
  const baseName = path.split('/').pop() || '';
  const dotIndex = baseName.lastIndexOf('.');
  return dotIndex === -1
    ? { stem: baseName, extension: '' }
    : { stem: baseName.slice(0, dotIndex), extension: baseName.slice(dotIndex) };
}

/** Date.now() alone repeats within a millisecond, and ids must be unique. */
const createFileId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Whether `name` is the path `root` itself or anything nested under it. */
const isWithin = (name: string, root: string) => name === root || name.startsWith(`${root}/`);

/**
 * Builds a save request body. Edits replace file objects rather than mutating
 * them, so any object still identical to one the server acknowledged is
 * unchanged and doesn't need resending; `fileIds` tells the server what to keep.
 */
function buildSaveBody(files: CodeFile[], savedFiles: CodeFile[] | null) {
  if (!savedFiles) return { files };
  const unchanged = new Set(savedFiles);
  return {
    files: files.filter(file => !unchanged.has(file)),
    fileIds: files.map(file => file.id),
  };
}

function buildTree(files: CodeFile[]) {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };
  files.forEach(file => {
    const parts = file.name.split('/');
    let current = root;
    let path = '';
    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      path = path ? `${path}/${part}` : part;
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
  const [files, setFiles] = useState<CodeFile[]>(() => {
    if (!initialFiles) return [{ id: createFileId(), name: 'main.txt', content: '' }];
    // Ids used to come from Date.now() and can repeat in stored snippets.
    // Re-id repeats so tabs, edits and saves can address each file.
    const seen = new Set<string>();
    return initialFiles.map(file => {
      if (!seen.has(file.id)) {
        seen.add(file.id);
        return file;
      }
      return { ...file, id: createFileId() };
    });
  });
  const [activeFileId, setActiveFileId] = useState<string>(files[0]?.id || '');
  const [openTabIds, setOpenTabIds] = useState<string[]>(() =>
    (files.length <= MAX_INITIAL_TABS ? files : files.slice(0, 1)).map(f => f.id)
  );
  const [saveState, setSaveState] = useState<SaveState>(
    initialSnippetId ? { status: 'saved' } : { status: 'idle' }
  );
  const [softWrap, setSoftWrap] = useState(false);
  /** Phone-width only: the file tree becomes a drawer. Ignored on desktop. */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRootDropActive, setIsRootDropActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [pendingUploadPath, setPendingUploadPath] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState<string>('');
  /** In-progress file rename; applied on Enter/blur so it can be checked first. */
  const [fileRenameDraft, setFileRenameDraft] = useState<{ id: string; stem: string } | null>(null);
  // Drop a draft whose input went away without blurring (active file or mode
  // changed), so it can't resurface and commit later.
  const draftContext = `${activeFileId}:${isReadOnly}`;
  const [draftContextSeen, setDraftContextSeen] = useState(draftContext);
  if (draftContextSeen !== draftContext) {
    setDraftContextSeen(draftContext);
    setFileRenameDraft(null);
  }
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const tabListRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // The tree and tabs look files up by id per row; a scan each time is O(n²).
  const filesById = useMemo(() => new Map(files.map(file => [file.id, file])), [files]);
  const activeFile = filesById.get(activeFileId);
  const tree = useMemo(() => buildTree(files), [files]);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string, type: 'file' | 'folder', path: string) => {
    if (isReadOnly) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type, path }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  /** Distinguishes an OS file drag from an internal file/folder move. */
  const dragCarriesFiles = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.types).includes('Files');

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
    // Only the additions: reads are async, and the user may toggle folders meanwhile.
    const nextExpanded = new Set<string>();
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
          const storedContent = await readFileContent(file);
          return {
            id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            name: uniquePath,
            ...storedContent,
          };
        })
      );
      setFiles(prev => [...prev, ...uploadedFiles]);
      setExpandedFolders(prev => new Set([...prev, ...nextExpanded]));
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

  const handleFolderUploadClick = (targetPath: string = '') => {
    if (isReadOnly) return;
    setPendingUploadPath(targetPath);
    folderInputRef.current?.click();
  };

  const handleFileUploadClick = (targetPath: string = '') => {
    if (isReadOnly) return;
    setPendingUploadPath(targetPath);
    fileInputRef.current?.click();
  };

  const handleUploadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || !selected.length) return;
    await uploadFilesAtPath(selected, pendingUploadPath);
    e.target.value = '';
  };

  /*
   * Moves a folder and everything in it. Refuses when the destination is
   * already in use: two files sharing a path collapse into one tree row, which
   * silently hid the second file while still saving and zipping both.
   */
  const relocateFolder = (fromPath: string, toPath: string): boolean => {
    if (fromPath === toPath) return false;
    if (files.some(f => !isWithin(f.name, fromPath) && isWithin(f.name, toPath))) {
      showToast(`"${toPath.split('/').pop()}" already exists there`);
      return false;
    }

    const relocate = (path: string) =>
      isWithin(path, fromPath) ? `${toPath}${path.substring(fromPath.length)}` : path;

    setFiles(prev => prev.map(f => (isWithin(f.name, fromPath) ? { ...f, name: relocate(f.name) } : f)));
    setExpandedFolders(prev => new Set(Array.from(prev, relocate)));
    return true;
  };

  const handleFolderRename = (oldPath: string, newFolderName: string) => {
    if (isReadOnly) return;
    if (newFolderName.includes('/')) {
      showToast('Folder names cannot contain "/"');
      return;
    }
    const parts = oldPath.split('/');
    parts.pop();
    const newFolderPath = parts.length > 0 ? `${parts.join('/')}/${newFolderName}` : newFolderName;

    if (relocateFolder(oldPath, newFolderPath)) {
      showToast(`Renamed folder to ${newFolderName}`);
    }
  };

  const handleFolderDownload = (folderPath: string) => {
    const prefix = folderPath + '/';
    const entries = files
      .filter(f => f.name === folderPath || f.name.startsWith(prefix))
      .map(f => ({
        path: f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name,
        content: getFileBytes(f),
      }))
      .filter(e => e.path.length > 0);

    if (entries.length === 0) {
      showToast('Folder is empty');
      return;
    }

    const folderName = folderPath.split('/').pop() || 'folder';
    try {
      const blob = createZip(entries);
      downloadBlob(blob, `${folderName}.zip`);
      showToast(`Downloaded ${folderName}.zip`);
    } catch (error) {
      console.error('Folder download error:', error);
      showToast('Failed to download folder');
    }
  };

  const handleFileDownload = (file: CodeFile) => {
    try {
      const fileName = file.name.split('/').pop() || file.name;
      downloadBlob(createFileBlob(file), fileName);
      showToast(`Downloaded ${fileName}`);
    } catch (error) {
      console.error('File download error:', error);
      showToast('Failed to download file');
    }
  };

  const handleFolderDelete = (folderPath: string) => {
    if (isReadOnly) return;

    const newFiles = files.filter(f => f.name !== folderPath && !f.name.startsWith(folderPath + '/'));

    if (newFiles.length === 0) {
      showToast('Cannot delete the last folder containing the only file.');
      return;
    }

    setFiles(newFiles);

    const deletedFileIds = files
      .filter(f => f.name === folderPath || f.name.startsWith(folderPath + '/'))
      .map(f => f.id);
    const newTabs = openTabIds.filter(id => !deletedFileIds.includes(id));
    // Large snippets start with one tab; don't strand the user on an empty editor.
    if (newTabs.length === 0) newTabs.push(newFiles[0].id);
    setOpenTabIds(newTabs);

    if (deletedFileIds.includes(activeFileId)) {
      setActiveFileId(newTabs[newTabs.length - 1]);
    }

    setExpandedFolders(prev => {
      const next = new Set<string>();
      prev.forEach(path => {
        if (path !== folderPath && !path.startsWith(folderPath + '/')) {
          next.add(path);
        }
      });
      return next;
    });

    showToast(`Deleted folder and all contents`);
  };

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    try {
      // Read entries synchronously: DataTransfer is neutered after this handler
      // returns, and only the entries API can describe dropped directories.
      const droppedEntries = readDropEntries(e.dataTransfer);
      if (droppedEntries.length > 0) {
        void flattenDropEntries(droppedEntries)
          .then(dropped => uploadFilesAtPath(dropped, targetPath))
          .catch(error => {
            console.error('Drop error:', error);
            showToast('Could not read the dropped items');
          });
        return;
      }

      // Browsers without the entries API still hand over plain files.
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
          if (fileToMove.name === newName) return;
          if (files.some(f => f.id !== id && isWithin(f.name, newName))) {
            showToast(`"${fileName}" already exists there`);
            return;
          }
          setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
        }
      } else if (type === 'folder') {
        if (targetPath === sourcePath || targetPath.startsWith(sourcePath + '/')) {
          showToast("Cannot move a folder into itself");
          return;
        }
        const folderName = sourcePath.split('/').pop();
        relocateFolder(sourcePath, targetPath ? `${targetPath}/${folderName}` : folderName);
      }
    } catch (err) {
      console.error("Drop error:", err);
    }
  };

  const handleAddFolder = (parentPath: string = '') => {
    if (isReadOnly) return;
    const folderPath = (n: number) => (parentPath ? `${parentPath}/new-folder-${n}` : `new-folder-${n}`);
    let counter = 1;
    while (files.some(f => isWithin(f.name, folderPath(counter)))) counter += 1;
    const fullPath = folderPath(counter);
    const newFile = { id: createFileId(), name: `${fullPath}/new-file.txt`, content: '' };
    setFiles(prev => [...prev, newFile]);
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
    // Don't auto-open the placeholder file in editor
  };

  const showToast = (msg: string) => {
    // Each toast gets its full 3s; a stale timer used to cut the next one short.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAddFile = (parentPath: string = '') => {
    if (isReadOnly) return;
    // `files.length + 1` alone repeats a name once an earlier file is deleted.
    const filePath = (n: number) => (parentPath ? `${parentPath}/file-${n}.txt` : `file-${n}.txt`);
    let counter = files.length + 1;
    while (files.some(f => isWithin(f.name, filePath(counter)))) counter += 1;
    const newFile = { id: createFileId(), name: filePath(counter), content: '' };
    setFiles(prev => [...prev, newFile]);
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

  /*
   * Renames used to apply on every keystroke, so passing through (or stopping
   * on) a sibling's name produced two files with one path, and the tree showed
   * only one of them. The draft is now checked once, when the user commits.
   */
  const commitFileRename = (id: string, stem: string) => {
    setFileRenameDraft(null);
    if (isReadOnly) return;

    const file = filesById.get(id);
    if (!file) return;

    const nextStem = stem.trim();
    const { stem: currentStem, extension } = splitFileName(file.name);
    if (nextStem === currentStem) return;
    // Only an already-empty stem (dotfiles like `.env`) may stay empty; clearing
    // `main.ts` would otherwise rename it to `.ts`.
    if (!nextStem) {
      showToast('File name cannot be empty');
      return;
    }
    // A slash would move the file into folders this check never inspected.
    if (nextStem.includes('/')) {
      showToast('File names cannot contain "/"');
      return;
    }

    const parentPath = file.name.split('/').slice(0, -1).join('/');
    const fileName = `${nextStem}${extension}`;
    const nextName = parentPath ? `${parentPath}/${fileName}` : fileName;
    if (files.some(f => f.id !== id && isWithin(f.name, nextName))) {
      showToast(`"${fileName}" already exists there`);
      return;
    }

    setFiles(prev => prev.map(f => (f.id === id ? { ...f, name: nextName } : f)));
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTabs = openTabIds.filter(t => t !== id);
    setOpenTabIds(newTabs);
    if (activeFileId === id) {
      setActiveFileId(newTabs[newTabs.length - 1] || '');
    }
  };

  const handleDeleteFile = (id: string) => {
    if (isReadOnly) return;
    if (files.length === 1) {
      showToast('Cannot delete the last file.');
      return;
    }
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);

    const newTabs = openTabIds.filter(t => t !== id);
    // Large snippets start with one tab; don't strand the user on an empty editor.
    if (newTabs.length === 0) newTabs.push(newFiles[0].id);
    setOpenTabIds(newTabs);

    if (activeFileId === id) {
      setActiveFileId(newTabs[newTabs.length - 1]);
    }
  };

  const handleContentChange = (nextContent: string) => {
    if (isReadOnly) return;
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: nextContent } : f));
  };

  /*
   * Save bookkeeping.
   *
   * `revision` counts edits; `savedRevision` records the revision that last
   * reached the server. Comparing the two is how the status pill knows whether
   * there is genuinely unsaved work, without re-serializing every file on each
   * keystroke.
   *
   * Saves never overlap: a request that arrives while one is in flight sets
   * `resavePending` instead, so the newest state is written once the current
   * write lands. Firing them concurrently risks an older payload landing last.
   *
   * `savedFiles` is the file list the server last acknowledged. Updates send
   * only what differs from it, so an autosave after a one-character edit no
   * longer re-uploads every file and binary in the snippet.
   */
  const filesRef = React.useRef(files);
  const lastSeenFilesRef = React.useRef(files);
  // The raw server list, so any file re-id'd on load counts as changed.
  const savedFilesRef = React.useRef<CodeFile[] | null>(initialSnippetId ? initialFiles ?? null : null);
  /*
   * The site and the Convex functions deploy separately, so the backend may
   * predate partial saves and reject `fileIds`. After a partial save fails on
   * the server, this tab falls back to full saves, which every version accepts.
   */
  const partialSavesRef = React.useRef(true);
  const snippetIdRef = React.useRef(initialSnippetId);
  const revisionRef = React.useRef(0);
  const savedRevisionRef = React.useRef(0);
  const isSavingRef = React.useRef(false);
  const resavePendingRef = React.useRef(false);
  const runSaveRef = React.useRef<(auto: boolean) => Promise<void>>(async () => {});

  const readErrorMessage = async (response: Response) => {
    // Server faults carry nothing actionable ("Internal Server Error").
    if (response.status >= 500) return "Couldn't save";
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') return data.error;
    } catch {
      // Fall through to the status-based message.
    }
    if (response.status === 413) return 'Snippet is too large to save';
    return `Save failed (${response.status})`;
  };

  /*
   * Deliberately not gated on `isReadOnly`. Auto-saves are already suppressed in
   * view mode by the effect below, and the Save button only renders while
   * editing. Blocking here instead would strand a failed save's changes the
   * moment the user switched to view mode, leaving an inert Retry button.
   */
  const runSave = React.useCallback(async (auto: boolean) => {
    if (isSavingRef.current) {
      resavePendingRef.current = true;
      return;
    }

    isSavingRef.current = true;
    const revision = revisionRef.current;
    const filesToSave = filesRef.current;
    const existingId = snippetIdRef.current;
    const savedFiles = existingId && partialSavesRef.current ? savedFilesRef.current : null;
    const payload = JSON.stringify(buildSaveBody(filesToSave, savedFiles));
    setSaveState({ status: 'saving' });

    try {
      const response = existingId
        ? await fetch(`/api/snippets/${existingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          })
        : await fetch('/api/snippets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        if (savedFiles && (response.status === 409 || response.status >= 500)) {
          // 409: the server no longer has what this tab last saved.
          // 5xx: possibly a backend without partial-save support.
          // Either way, resend everything straight away.
          if (response.status >= 500) partialSavesRef.current = false;
          savedFilesRef.current = null;
          resavePendingRef.current = true;
          return;
        }
        setSaveState({ status: 'error', message });
        return;
      }

      if (!existingId) {
        const data = await response.json();
        if (!data?.id) {
          setSaveState({ status: 'error', message: 'Server did not return a snippet link' });
          return;
        }
        snippetIdRef.current = data.id;
        setCurrentSnippetId(data.id);
        window.history.replaceState(null, '', `/${data.id}`);
        // Edits made during the create had no URL to schedule an autosave for.
        if (revisionRef.current > revision) resavePendingRef.current = true;
      }

      savedRevisionRef.current = revision;
      savedFilesRef.current = filesToSave;
      // More edits landed while the request was in flight.
      setSaveState(revisionRef.current > revision ? { status: 'unsaved' } : { status: 'saved' });

      if (!auto) {
        showToast(existingId ? 'Snippet updated' : 'Snippet saved');
        setIsReadOnly(true);
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveState({
        status: 'error',
        message: typeof navigator !== 'undefined' && !navigator.onLine
          ? 'Offline — changes are kept in this tab'
          : 'Could not reach the server',
      });
    } finally {
      isSavingRef.current = false;
      if (resavePendingRef.current) {
        resavePendingRef.current = false;
        void runSaveRef.current(true);
      }
    }
  }, []);

  runSaveRef.current = runSave;

  /*
   * Keyed on `files` alone. It used to depend on `isReadOnly` too, which broke
   * both directions of the Edit/View toggle: entering edit mode counted as an
   * edit (a spurious "Unsaved" and a full re-save of unchanged files), and
   * switching to view mode within the debounce window cancelled the pending
   * autosave. Read-only mode can't change `files`, so it needs no gate here.
   *
   * Only a new `files` identity is an edit; rescheduling whenever work is
   * outstanding keeps StrictMode's effect replay from swallowing the save.
   */
  React.useEffect(() => {
    filesRef.current = files;

    if (lastSeenFilesRef.current !== files) {
      lastSeenFilesRef.current = files;
      revisionRef.current += 1;
      setSaveState({ status: 'unsaved' });
    }

    // Unsaved drafts have no URL to PATCH yet; the Save button creates one.
    if (!snippetIdRef.current || revisionRef.current === savedRevisionRef.current) return;

    const timer = setTimeout(() => { void runSaveRef.current(true); }, 1000);
    return () => clearTimeout(timer);
  }, [files]);

  // Guard against losing work on reload while anything is pending.
  React.useEffect(() => {
    const atRisk = saveState.status === 'unsaved'
      || saveState.status === 'saving'
      || saveState.status === 'error';
    if (!atRisk) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [saveState.status]);

  React.useEffect(() => {
    if (!isSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      // A menu inside the drawer handles its own Escape; close one layer at a time.
      if (event.key === 'Escape' && !event.defaultPrevented) setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isSidebarOpen]);

  // Opening a file from the tree (or the phone drawer) could leave its tab
  // scrolled out of the strip, with nothing showing which file was open.
  React.useEffect(() => {
    tabListRef.current
      ?.querySelector<HTMLElement>('.tab-item.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeFileId]);

  // Soft wrap is a per-reader preference, so it lives in localStorage rather
  // than in the snippet. Read after mount to keep SSR markup stable.
  React.useEffect(() => {
    try {
      setSoftWrap(window.localStorage.getItem('teter:soft-wrap') === '1');
    } catch {
      // Storage unavailable (private mode); the default is fine.
    }
  }, []);

  const toggleSoftWrap = () => {
    setSoftWrap(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem('teter:soft-wrap', next ? '1' : '0');
      } catch {
        // Preference just won't persist.
      }
      return next;
    });
  };

  const handleCopyCode = () => {
    if (activeFile?.encoding === 'base64') {
      showToast('Binary files cannot be copied as text');
      return;
    }
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

  /*
   * Every tree row gets the same single overflow menu, whether it is a file or a
   * folder and however many actions it has. Previously a one-action row rendered
   * a bare icon button while a multi-action row rendered a three-dot menu, so
   * the same gesture did different things depending on the row and mode.
   *
   * `fixed` positioning is required here: the file list is a scroll container,
   * and the old absolutely positioned dropdown was clipped for rows near the
   * bottom of the sidebar.
   */
  const renderItemActions = (actions: MenuAction[], label: string) => {
    if (actions.length === 0) return null;

    return (
      <div className="item-actions-wrapper" onClick={(e) => e.stopPropagation()}>
        <MenuButton
          icon={<MoreVertical size={14} />}
          label={label}
          actions={actions}
          align="right"
          strategy="fixed"
          triggerClassName="tree-menu-trigger"
        />
      </div>
    );
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

          const folderOptions: MenuAction[] = isReadOnly ? [
            {
              label: 'Download folder',
              icon: <Download size={14} />,
              onSelect: () => handleFolderDownload(child.path)
            }
          ] : [
            {
              label: 'New file',
              icon: <FilePlus size={14} />,
              onSelect: () => handleAddFile(child.path)
            },
            {
              label: 'New folder',
              icon: <FolderPlus size={14} />,
              onSelect: () => handleAddFolder(child.path)
            },
            {
              label: 'Upload files',
              icon: <FileUp size={14} />,
              onSelect: () => handleFileUploadClick(child.path)
            },
            {
              label: 'Upload folder',
              icon: <FolderUp size={14} />,
              onSelect: () => handleFolderUploadClick(child.path)
            },
            {
              label: 'Download folder',
              icon: <Download size={14} />,
              onSelect: () => handleFolderDownload(child.path)
            },
            {
              label: 'Rename folder',
              icon: <Pencil size={14} />,
              onSelect: () => {
                setEditingFolderPath(child.path);
                setFolderRenameValue(child.name);
              }
            },
            {
              label: 'Delete folder',
              icon: <Trash2 size={14} />,
              danger: true,
              onSelect: () => {
                if (confirm(`Are you sure you want to delete the folder "${child.name}" and all of its contents?`)) {
                  handleFolderDelete(child.path);
                }
              }
            }
          ];

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
                {editingFolderPath === child.path ? (
                  <input
                    type="text"
                    className="file-name-input"
                    value={folderRenameValue}
                    onChange={(e) => setFolderRenameValue(e.target.value)}
                    onBlur={() => {
                      if (folderRenameValue.trim() && folderRenameValue.trim() !== child.name) {
                        handleFolderRename(child.path, folderRenameValue.trim());
                      }
                      setEditingFolderPath(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (folderRenameValue.trim() && folderRenameValue.trim() !== child.name) {
                          handleFolderRename(child.path, folderRenameValue.trim());
                        }
                        setEditingFolderPath(null);
                      } else if (e.key === 'Escape') {
                        setEditingFolderPath(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                ) : (
                  <span style={{ flex: 1 }}>{child.name}</span>
                )}
                {renderItemActions(folderOptions, `Actions for folder ${child.name}`)}
              </summary>
              <ul>
                {renderTreeNodes(child, depth + 1)}
              </ul>
            </details>
          );
        } else {
          const isActive = activeFileId === child.id;

          const selectedFile = filesById.get(child.id!);
          const fileOptions: MenuAction[] = [
            {
              label: 'Download file',
              icon: <Download size={14} />,
              onSelect: () => {
                if (selectedFile) handleFileDownload(selectedFile);
              }
            },
            ...(!isReadOnly ? [{
              label: 'Delete file',
              icon: <Trash2 size={14} />,
              danger: true,
              onSelect: () => handleDeleteFile(child.id!)
            }] : [])
          ];

          return (
            <li key={child.id}>
              <div
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (!openTabIds.includes(child.id!)) {
                    setOpenTabIds(prev => [...prev, child.id!]);
                  }
                  setActiveFileId(child.id!);
                  setIsSidebarOpen(false);
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
                    value={fileRenameDraft && fileRenameDraft.id === child.id
                      ? fileRenameDraft.stem
                      : splitFileName(selectedFile?.name || '').stem}
                    onChange={(e) => setFileRenameDraft({ id: child.id!, stem: e.target.value })}
                    onBlur={() => {
                      if (fileRenameDraft && fileRenameDraft.id === child.id) commitFileRename(child.id!, fileRenameDraft.stem);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setFileRenameDraft(null);
                        // Blur after React drops the draft so onBlur has nothing to commit.
                        const input = e.currentTarget;
                        requestAnimationFrame(() => input.blur());
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="filename"
                  />
                )}
                {renderItemActions(fileOptions, `Actions for ${child.name}`)}
              </div>
            </li>
          );
        }
      });
  };

  return (
    <div className="app-container">
      {/* Sidebar: a fixed column on desktop, a slide-in drawer on phones. */}
      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />
      )}
      <div id="file-sidebar" className={`sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <span className="brand-name">Teter</span>
          <button
            type="button"
            className="btn btn-icon sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close files"
            title="Close files"
          >
            <X size={18} />
          </button>
        </div>

        {/* White body inset into the dark chrome, curved at its top corners. */}
        <div className="sidebar-body">
        <div className="sidebar-header">
          <span className="sidebar-title">Files</span>
          {!isReadOnly && (
            <div className="sidebar-actions">
              {/*
                Fixed, not absolute: the sidebar is `overflow: hidden`, and these
                panels are wider than the space left of their trigger, so an
                absolute panel gets its left edge clipped off.
              */}
              <MenuButton
                icon={<Upload size={16} />}
                label="Upload"
                strategy="fixed"
                actions={[
                  {
                    label: 'Upload files',
                    icon: <FileUp size={14} />,
                    hint: 'One or many',
                    onSelect: () => handleFileUploadClick(''),
                  },
                  {
                    label: 'Upload folder',
                    icon: <FolderUp size={14} />,
                    hint: 'Keeps structure',
                    onSelect: () => handleFolderUploadClick(''),
                  },
                ]}
              />
              <MenuButton
                icon={<Plus size={17} />}
                label="Create"
                strategy="fixed"
                actions={[
                  {
                    label: 'New file',
                    icon: <FilePlus size={14} />,
                    onSelect: () => handleAddFile(''),
                  },
                  {
                    label: 'New folder',
                    icon: <FolderPlus size={14} />,
                    onSelect: () => handleAddFolder(''),
                  },
                ]}
              />
            </div>
          )}
        </div>

        {/*
          The whole list is the root drop target. Child folders call
          stopPropagation in handleDrop, so this only handles drops that land on
          empty space — previously that was just the bare <ul>, a sliver.
        */}
        <div
          className={`file-list-container ${isRootDropActive ? 'is-drop-target' : ''}`}
          onDragOver={(e) => {
            handleDragOver(e);
            if (!isReadOnly && dragCarriesFiles(e.dataTransfer)) {
              e.dataTransfer.dropEffect = 'copy';
              setIsRootDropActive(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsRootDropActive(false);
            }
          }}
          onDrop={(e) => {
            setIsRootDropActive(false);
            handleDrop(e, '');
          }}
        >
          <ul className="tree-view">
            {renderTreeNodes(tree)}
          </ul>

          {!isReadOnly && (
            <p className="drop-hint" aria-hidden="true">
              Drop files or folders here
            </p>
          )}
        </div>

        {/* Delete Project button in sidebar footer */}
        {currentSnippetId && (
          <div className="sidebar-footer">
            <button className="btn btn-danger w-full" onClick={() => setIsDeleteConfirmOpen(true)}>
              <Trash2 size={14} />
              Delete Project
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Main Area */}
      <div className="main-area">
        {/*
          Two-tier header: a dark tab strip, then the white toolbar the active
          tab opens into, so the editor reads as a window beneath its tabs.
        */}
        <div className="tab-strip">
          <button
            type="button"
            className="btn btn-icon sidebar-toggle"
            onClick={() => setIsSidebarOpen(true)}
            aria-expanded={isSidebarOpen}
            aria-controls="file-sidebar"
            aria-label="Show files"
            title="Show files"
          >
            <PanelLeft size={18} />
          </button>

          <div className="tab-list" ref={tabListRef}>
            {openTabIds.map(tabId => {
              const file = filesById.get(tabId);
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
        </div>

        <div className="window-body">
        <div className="toolbar">
          {activeFile && (
            <div className="toolbar-path" title={activeFile.name}>
              {activeFile.name.split('/').map((part, index, parts) => (
                <React.Fragment key={index}>
                  {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
                  <span className={index === parts.length - 1 ? 'is-current' : undefined}>{part}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="header-actions">
            <SaveStatus
              state={saveState}
              autoSaves={Boolean(currentSnippetId)}
              onRetry={() => void runSave(true)}
            />

            <button
              className={`btn btn-icon ${softWrap ? 'is-active' : ''}`}
              onClick={toggleSoftWrap}
              aria-pressed={softWrap}
              title={softWrap ? 'Soft wrap on — click to scroll long lines' : 'Soft wrap off — click to wrap long lines'}
            >
              <WrapText size={16} />
            </button>

            <button
              className="btn btn-outline"
              onClick={handleCopyCode}
              disabled={!activeFile || activeFile.encoding === 'base64'}
              title={activeFile?.encoding === 'base64' ? 'Binary files cannot be copied as text' : 'Copy file contents'}
            >
              <Copy size={14} />
              <span className="btn-label">Copy</span>
            </button>

            {activeFile && (
              <button
                className="btn btn-outline"
                onClick={() => handleFileDownload(activeFile)}
                title="Download file"
              >
                <Download size={14} />
                <span className="btn-label">Download</span>
              </button>
            )}

            {currentSnippetId && (
              <button
                className="btn btn-outline"
                onClick={() => setIsReadOnly(!isReadOnly)}
                title={isReadOnly ? 'Switch to edit mode' : 'Switch to view mode'}
              >
                {isReadOnly ? <Pencil size={14} /> : <Eye size={14} />}
                {/* An action, like "Edit"; "Viewing" read as the current state. */}
                <span className="btn-label">{isReadOnly ? 'Edit' : 'View'}</span>
              </button>
            )}

            {!isReadOnly && (
              <button
                className="btn btn-primary"
                onClick={() => void runSave(false)}
                disabled={saveState.status === 'saving'}
              >
                <Save size={14} />
                {saveState.status === 'saving' ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>

        <div className="editor-area">
          <div className="editor-wrapper">
            {activeFile?.encoding === 'base64' ? (
              <div className="hero-message binary-file-message">
                <FileText size={48} strokeWidth={1} />
                <p>{activeFile.name.split('/').pop()} is a binary file</p>
                <span>
                  Binary files cannot be edited here · {formatFileSize(getFileSize(activeFile))}
                </span>
                <button className="btn btn-primary" onClick={() => handleFileDownload(activeFile)}>
                  <Download size={14} />
                  Download file
                </button>
              </div>
            ) : activeFile ? (
              <CodeEditor
                key={activeFile.id}
                value={activeFile.content}
                fileName={activeFile.name}
                readOnly={isReadOnly}
                wrap={softWrap}
                onChange={handleContentChange}
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
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden folder input for uploads */}
      <input
        ref={folderInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleUploadInputChange}
        {...({
          webkitdirectory: "",
          directory: "",
          multiple: true
        } as React.InputHTMLAttributes<HTMLInputElement>)}
      />

      {/* Hidden multi-file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleUploadInputChange}
      />

      {/* Delete Project Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <span className="modal-title">Delete Project</span>
            <p className="modal-description">
              Are you sure you want to delete this project? This action is permanent and will delete all files and the project page itself.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  handleDeleteSnippet();
                }}
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
