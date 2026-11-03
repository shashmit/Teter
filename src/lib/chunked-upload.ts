/**
 * Moving file content too large for one request in pieces.
 *
 * A save request goes through a Vercel function (4.5 MB body limit) into a
 * Convex document (1 MiB limit), so a 14 MB file could never be saved whole.
 * Large content is split into chunks, written a batch per request, and the
 * save then refers to the upload by id instead of carrying the content.
 */
import {
  BATCH_BYTES,
  CHUNK_CHARS,
  MAX_FILE_BYTES,
  MAX_UPLOAD_CHUNKS,
  utf8Length,
} from '../../convex/uploadLimits';

export { MAX_FILE_BYTES, utf8Length };

/** Content longer than this is always uploaded in chunks rather than inline. */
export const INLINE_MAX_CHARS = CHUNK_CHARS;

/** Inline content a single save request may carry before files move to uploads. */
export const SAVE_INLINE_BUDGET_BYTES = BATCH_BYTES;

/** A failure worth showing the user as-is. */
export class UploadError extends Error {}

const ATTEMPTS = 3;

function splitIntoChunks(content: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + CHUNK_CHARS, content.length);
    // Never cut between a surrogate pair: half a character isn't valid text.
    const last = content.charCodeAt(end - 1);
    if (end < content.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(content.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Groups consecutive chunks so each request stays under BATCH_BYTES. */
function batchChunks(chunks: string[]) {
  const batches: { index: number; data: string }[][] = [];
  let current: { index: number; data: string }[] = [];
  let bytes = 0;

  chunks.forEach((data, index) => {
    const size = utf8Length(data);
    if (current.length > 0 && bytes + size > BATCH_BYTES) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push({ index, data });
    bytes += size;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Retries network failures and server faults; 4xx answers are final. */
async function request(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status < 500 || attempt === ATTEMPTS) return response;
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
  }
}

async function failure(response: Response, fallback: string): Promise<UploadError> {
  if (response.status === 413) return new UploadError('File is too large to upload');
  try {
    const data = await response.json();
    if (response.status < 500 && typeof data?.error === 'string') return new UploadError(data.error);
  } catch {
    // No JSON body; use the fallback.
  }
  return new UploadError(fallback);
}

/**
 * Uploads `content` in chunks and returns the upload id to save in its place.
 * `onProgress` receives how many characters have been sent so far.
 */
export async function uploadContent(
  content: string,
  onProgress?: (sentChars: number) => void,
): Promise<string> {
  const chunks = splitIntoChunks(content);
  if (chunks.length > MAX_UPLOAD_CHUNKS) throw new UploadError('File is too large to upload');

  const created = await request('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunkCount: chunks.length }),
  });
  if (!created.ok) throw await failure(created, "Couldn't start the upload");
  const { uploadId } = await created.json() as { uploadId: string };

  let sent = 0;
  for (const batch of batchChunks(chunks)) {
    const response = await request(`/api/uploads/${encodeURIComponent(uploadId)}/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunks: batch }),
    });
    if (!response.ok) throw await failure(response, 'Upload failed partway');
    for (const chunk of batch) sent += chunk.data.length;
    onProgress?.(sent);
  }

  return uploadId;
}

/** Reads an upload back and joins its chunks into the original content. */
export async function downloadContent(uploadId: string): Promise<string> {
  const parts: string[] = [];
  let from: number | null = 0;

  while (from !== null) {
    const response = await request(
      `/api/uploads/${encodeURIComponent(uploadId)}/chunks?from=${from}`,
    );
    if (!response.ok) throw await failure(response, "Couldn't load the file");
    const page = await response.json() as { chunks: string[]; next: number | null };
    // An empty page that isn't the end would loop forever.
    if (page.chunks.length === 0 && page.next !== null) throw new UploadError("Couldn't load the file");
    parts.push(...page.chunks);
    from = page.next;
  }

  return parts.join('');
}
