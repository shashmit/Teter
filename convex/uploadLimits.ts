/*
 * Limits for chunked uploads, shared by the Convex functions and the browser.
 *
 * Convex caps a document at 1 MiB, and Vercel caps a function's request and
 * response bodies at 4.5 MB, so a large file is split into chunks small enough
 * for one document each and moved a few chunks per request.
 */

/**
 * Characters per chunk. A UTF-16 code unit is at most 3 bytes of UTF-8, so a
 * chunk never exceeds 768 KiB, under the 1 MiB document limit. Binary files
 * are base64 (ASCII), so for them this is 256 KiB per chunk.
 */
export const CHUNK_CHARS = 256 * 1024;

/** Most UTF-8 bytes of chunk data moved by one request, under Vercel's 4.5 MB. */
export const BATCH_BYTES = 3 * 1024 * 1024;

/** Server-side ceiling on one upload: 256 chunks is 64 Mi characters. */
export const MAX_UPLOAD_CHUNKS = 256;

/** Largest file the editor accepts. Base64 makes this ~33.3 Mi characters. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** UTF-8 length of a string without allocating an encoded copy. */
export function utf8Length(value: string): number {
    let bytes = 0;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
            // A surrogate pair is one 4-byte character.
            bytes += 4;
            index += 1;
        } else bytes += 3;
    }
    return bytes;
}
