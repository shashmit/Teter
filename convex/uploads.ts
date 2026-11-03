import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { BATCH_BYTES, CHUNK_CHARS, MAX_UPLOAD_CHUNKS, utf8Length } from "./uploadLimits";

/*
 * Chunked uploads for file content too large for one document.
 *
 * The browser creates an upload, writes its chunks a batch per request, then
 * saves the snippet with the file's `uploadId` in place of its content. That
 * save claims the upload for the snippet. Claimed uploads are immutable and are
 * purged when their file is deleted or replaced. Uploads never claimed (a tab
 * closed mid-save) are swept by the cron in crons.ts.
 */

export type UploadErrorCode = "upload_missing" | "invalid_upload";

/** Unclaimed uploads older than this are treated as abandoned. */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
/** Chunks deleted per purge run; each is under 1 MiB, keeping reads well inside limits. */
const PURGE_BATCH = 8;
const SWEEP_BATCH = 100;

function fail(code: UploadErrorCode): never {
    throw new ConvexError({ code });
}

export const create = mutation({
    args: { chunkCount: v.number() },
    handler: async (ctx, { chunkCount }) => {
        if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_UPLOAD_CHUNKS) {
            fail("invalid_upload");
        }
        return await ctx.db.insert("uploads", { chunkCount, received: 0 });
    },
});

/** Stores chunks by index. Re-sending a chunk (a retried request) overwrites it. */
export const putChunks = mutation({
    args: {
        uploadId: v.id("uploads"),
        chunks: v.array(v.object({ index: v.number(), data: v.string() })),
    },
    handler: async (ctx, { uploadId, chunks }) => {
        const upload = await ctx.db.get(uploadId);
        // Claimed uploads back a shared snippet whose readers know the id.
        if (!upload || upload.snippetId) fail("upload_missing");

        let received = upload.received;
        for (const { index, data } of chunks) {
            if (
                !Number.isInteger(index) || index < 0 || index >= upload.chunkCount
                || data.length === 0 || data.length > CHUNK_CHARS
            ) {
                fail("invalid_upload");
            }
            const existing = await ctx.db.query("uploadChunks")
                .withIndex("by_upload", q => q.eq("uploadId", uploadId).eq("index", index))
                .unique();
            if (existing) {
                await ctx.db.patch(existing._id, { data });
            } else {
                await ctx.db.insert("uploadChunks", { uploadId, index, data });
                received += 1;
            }
        }
        if (received !== upload.received) {
            await ctx.db.patch(uploadId, { received });
        }
    },
});

/**
 * Returns chunks from index `from` onward, as many as fit in one response.
 * `next` is where the following request should start, or null when done.
 */
export const readChunks = query({
    args: { uploadId: v.id("uploads"), from: v.number() },
    handler: async (ctx, { uploadId, from }) => {
        const upload = await ctx.db.get(uploadId);
        if (!upload || upload.received !== upload.chunkCount) return null;

        const chunks: string[] = [];
        let bytes = 0;
        const rows = ctx.db.query("uploadChunks")
            .withIndex("by_upload", q => q.eq("uploadId", uploadId).gte("index", from));
        for await (const row of rows) {
            const size = utf8Length(row.data);
            if (chunks.length > 0 && bytes + size > BATCH_BYTES) break;
            chunks.push(row.data);
            bytes += size;
        }

        const next = from + chunks.length;
        return { chunks, next: next < upload.chunkCount ? next : null };
    },
});

/**
 * Attaches a complete, unclaimed upload to a snippet. Requiring it to be
 * unclaimed also stops two files (or two snippets) sharing one upload, where
 * deleting either would purge the other's content.
 */
export async function claimUpload(ctx: MutationCtx, uploadId: Id<"uploads">, snippetId: Id<"snippets">) {
    const upload = await ctx.db.get(uploadId);
    if (!upload || upload.snippetId || upload.received !== upload.chunkCount) {
        fail("upload_missing");
    }
    await ctx.db.patch(uploadId, { snippetId });
}

/** Deletes an upload in the background; its chunks can exceed one mutation's read limit. */
export async function releaseUpload(ctx: MutationCtx, uploadId: Id<"uploads">) {
    await ctx.scheduler.runAfter(0, internal.uploads.purge, { uploadId });
}

export const purge = internalMutation({
    args: { uploadId: v.id("uploads") },
    handler: async (ctx, { uploadId }) => {
        // Row first, so nothing can claim or extend it while chunks drain.
        if (await ctx.db.get(uploadId)) await ctx.db.delete(uploadId);

        const chunks = await ctx.db.query("uploadChunks")
            .withIndex("by_upload", q => q.eq("uploadId", uploadId))
            .take(PURGE_BATCH);
        for (const chunk of chunks) await ctx.db.delete(chunk._id);

        if (chunks.length === PURGE_BATCH) {
            await ctx.scheduler.runAfter(0, internal.uploads.purge, { uploadId });
        }
    },
});

export const sweepAbandoned = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - ABANDONED_AFTER_MS;
        const abandoned = await ctx.db.query("uploads")
            .withIndex("by_snippetId", q => q.eq("snippetId", undefined).lt("_creationTime", cutoff))
            .take(SWEEP_BATCH);

        for (const upload of abandoned) {
            // Deleted here rather than in `purge`, so a rerun can't pick it up again.
            await ctx.db.delete(upload._id);
            await releaseUpload(ctx, upload._id);
        }
        if (abandoned.length === SWEEP_BATCH) {
            await ctx.scheduler.runAfter(0, internal.uploads.sweepAbandoned, {});
        }
    },
});
