/**
 * Turning a drop into a flat file list.
 *
 * `DataTransfer.files` only describes files. When a directory is dropped it
 * yields a single unreadable zero-byte entry, so dropping a folder needs the
 * entries API instead, walked recursively.
 */

/**
 * Reads the dropped entries. MUST be called synchronously inside the drop
 * handler: `DataTransfer` is neutered once the event handler returns, so
 * `webkitGetAsEntry()` has to run before any `await`.
 */
export function readDropEntries(dataTransfer: DataTransfer): FileSystemEntry[] {
  if (!dataTransfer.items) return [];

  return Array.from(dataTransfer.items)
    .filter(item => item.kind === 'file')
    .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** `readEntries` yields at most ~100 children per call, so it must be drained. */
async function readAllChildren(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];

  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    children.push(...batch);
  }

  return children;
}

/**
 * Flattens dropped entries into files, stamping each with the relative path it
 * had inside the dropped folder. That matches what `webkitdirectory` uploads
 * provide, so callers can treat dropped and picked folders identically.
 */
export async function flattenDropEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const collected: File[] = [];

  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await entryFile(entry as FileSystemFileEntry);
      const relativePath = `${prefix}${file.name}`;

      // File.webkitRelativePath is a prototype getter and empty for dropped
      // files; shadow it on the instance so the upload path sees the nesting.
      if (prefix) {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
          configurable: true,
        });
      }

      collected.push(file);
      return;
    }

    if (entry.isDirectory) {
      const children = await readAllChildren(entry as FileSystemDirectoryEntry);
      // Sequential: a wide tree fanned out in parallel can exhaust file handles.
      for (const child of children) {
        await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };

  for (const entry of entries) {
    await walk(entry, '');
  }

  return collected;
}
