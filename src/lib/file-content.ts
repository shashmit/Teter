export type FileEncoding = 'base64';

export interface StoredFileContent {
  name: string;
  content: string;
  encoding?: FileEncoding;
  mimeType?: string;
  size?: number;
}

const BINARY_EXTENSIONS = new Set([
  '7z', 'a', 'avi', 'bin', 'bmp', 'class', 'dll', 'dmg', 'doc', 'docx',
  'exe', 'gif', 'gz', 'ico', 'iso', 'jar', 'jpeg', 'jpg', 'mov', 'mp3',
  'mp4', 'o', 'obj', 'otf', 'pdf', 'png', 'ppt', 'pptx', 'rar', 'so',
  'tar', 'ttf', 'wav', 'webm', 'webp', 'woff', 'woff2', 'xls', 'xlsx',
  'zip',
]);

const TEXT_APPLICATION_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/sql',
  'application/typescript',
  'application/x-httpd-php',
  'application/xml',
]);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isLikelyBinary(file: File, bytes: Uint8Array): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && BINARY_EXTENSIONS.has(extension)) return true;

  if (
    file.type &&
    !file.type.startsWith('text/') &&
    !TEXT_APPLICATION_TYPES.has(file.type)
  ) {
    return true;
  }

  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.includes(0)) return true;

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(sample);
    let controlCharacters = 0;

    for (const character of decoded) {
      const code = character.charCodeAt(0);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        controlCharacters += 1;
      }
    }

    return decoded.length > 0 && controlCharacters / decoded.length > 0.1;
  } catch {
    return true;
  }
}

export async function readFileContent(
  file: File,
): Promise<Pick<StoredFileContent, 'content' | 'encoding' | 'mimeType' | 'size'>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || undefined;

  if (isLikelyBinary(file, bytes)) {
    return {
      content: bytesToBase64(bytes),
      encoding: 'base64',
      mimeType,
      size: bytes.byteLength,
    };
  }

  return {
    content: new TextDecoder('utf-8').decode(bytes),
    mimeType,
    size: bytes.byteLength,
  };
}

export function getFileBytes(file: StoredFileContent): Uint8Array {
  if (file.encoding === 'base64') {
    return base64ToBytes(file.content);
  }

  return new TextEncoder().encode(file.content);
}

export function createFileBlob(file: StoredFileContent): Blob {
  const bytes = getFileBytes(file);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const type = file.encoding === 'base64'
    ? 'application/octet-stream'
    : file.mimeType || 'text/plain;charset=utf-8';

  return new Blob([buffer], { type });
}

export function getFileSize(file: StoredFileContent): number {
  return file.size ?? getFileBytes(file).byteLength;
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
