import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v, type Infer } from "convex/values";
import { claimUpload, releaseUpload } from "./uploads";

const codeFileValidator = v.object({
    id: v.string(),
    name: v.string(),
    content: v.string(),
    encoding: v.optional(v.literal("base64")),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
    /** Content too large for one document, uploaded in chunks; `content` is ignored. */
    uploadId: v.optional(v.id("uploads")),
});

type CodeFileArg = Infer<typeof codeFileValidator>;

/*
 * Error codes callers branch on. They travel as ConvexError data because
 * production deployments replace a plain Error's message with "Server Error",
 * so matching on message text only ever worked in dev.
 */
export type SnippetErrorCode = "already_exists" | "stale";
// Saves can also fail with "upload_missing" (see uploads.ts): a file named an
// upload that is gone, incomplete or already in use.

function toRow(snippetId: Id<"snippets">, file: CodeFileArg) {
    return {
        snippetId,
        fileId: file.id,
        name: file.name,
        content: file.uploadId ? "" : file.content,
        encoding: file.encoding,
        mimeType: file.mimeType,
        size: file.size,
        uploadId: file.uploadId,
    };
}

/** Finds a snippet by its public id: `sites` first, then pre-`sites` data. */
async function resolveSnippetId(ctx: QueryCtx, shortId: string): Promise<Id<"snippets"> | null> {
    const site = await ctx.db.query("sites")
        .withIndex("by_customId", q => q.eq("customId", shortId))
        .first();
    if (site) return site.snippetId;

    const snippet = await ctx.db.query("snippets")
        .withIndex("by_shortId", q => q.eq("shortId", shortId))
        .first();
    return snippet?._id ?? null;
}

export const create = mutation({
    args: {
        shortId: v.string(),
        files: v.array(codeFileValidator),
        title: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        if (await resolveSnippetId(ctx, args.shortId)) {
            throw new ConvexError({ code: "already_exists" satisfies SnippetErrorCode });
        }

        const snippetId = await ctx.db.insert("snippets", {
            title: args.title,
        });

        await ctx.db.insert("sites", {
            customId: args.shortId,
            snippetId: snippetId,
        });

        for (const file of args.files) {
            if (file.uploadId) await claimUpload(ctx, file.uploadId, snippetId);
        }

        await Promise.all(
            args.files.map((file) => ctx.db.insert("snippetFiles", toRow(snippetId, file)))
        );
        return snippetId;
    },
});

export const getByShortId = query({
    args: { shortId: v.string() },
    handler: async (ctx, args) => {
        let snippet = null;

        // First try finding it in the sites table
        const site = await ctx.db.query("sites")
            .withIndex("by_customId", q => q.eq("customId", args.shortId))
            .first();

        if (site) {
            snippet = await ctx.db.get(site.snippetId);
        } else {
            // Fallback for old data without a site entry
            snippet = await ctx.db.query("snippets")
                .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
                .first();
        }

        if (!snippet) {
            return null;
        }

        const storedFiles = await ctx.db.query("snippetFiles")
            .withIndex("by_snippetId", q => q.eq("snippetId", snippet._id))
            .collect();
            
        const files = storedFiles.length
            ? storedFiles.map(file => ({
                id: file.fileId,
                name: file.name,
                content: file.content,
                encoding: file.encoding,
                mimeType: file.mimeType,
                size: file.size,
                uploadId: file.uploadId,
            }))
            : (snippet.filesJson ? JSON.parse(snippet.filesJson) : []);
            
        return {
            shortId: args.shortId, // Return what was asked for consistency
            title: snippet.title,
            files,
            _creationTime: snippet._creationTime,
        };
    },
});

export const exists = query({
    args: { shortId: v.string() },
    handler: async (ctx, args) => {
        return (await resolveSnippetId(ctx, args.shortId)) !== null;
    },
});

export const removeByShortId = mutation({
    args: { shortId: v.string() },
    handler: async (ctx, args) => {
        let snippetId = null;

        const site = await ctx.db.query("sites")
            .withIndex("by_customId", q => q.eq("customId", args.shortId))
            .first();

        if (site) {
            snippetId = site.snippetId;
            await ctx.db.delete(site._id);
        } else {
            const snippet = await ctx.db.query("snippets")
                .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
                .first();
            if (snippet) snippetId = snippet._id;
        }

        if (snippetId) {
            const storedFiles = await ctx.db.query("snippetFiles")
                .withIndex("by_snippetId", q => q.eq("snippetId", snippetId))
                .collect();
            for (const file of storedFiles) {
                await ctx.db.delete(file._id);
                if (file.uploadId) await releaseUpload(ctx, file.uploadId);
            }
            await ctx.db.delete(snippetId);
            return true;
        }
        return false;
    },
});

/*
 * Saves are diffed against what is stored rather than rewriting the snippet.
 * Autosave fires after every pause in typing, so delete-all/insert-all turned a
 * one-character edit into a rewrite of every file (and every binary) and could
 * blow through the per-mutation write limit on large folders.
 *
 * `files` holds the files to upsert. When `fileIds` is given it is the complete
 * list of files the snippet should keep, so the client can send only the files
 * that changed; without it, `files` is the whole snippet.
 */
export const update = mutation({
    args: {
        shortId: v.string(),
        files: v.array(codeFileValidator),
        fileIds: v.optional(v.array(v.string())),
        title: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const snippetId = await resolveSnippetId(ctx, args.shortId);
        if (!snippetId) return false;

        const keep = new Set(args.fileIds ?? []);
        for (const file of args.files) keep.add(file.id);
        if (keep.size === 0) {
            throw new Error("A snippet needs at least one file");
        }

        const snippet = await ctx.db.get(snippetId);
        const storedFiles = await ctx.db.query("snippetFiles")
            .withIndex("by_snippetId", q => q.eq("snippetId", snippetId))
            .collect();

        const stored = new Map<string, Doc<"snippetFiles">>();
        for (const row of storedFiles) {
            // Duplicate ids could only come from older clients; keep the first.
            if (!keep.has(row.fileId) || stored.has(row.fileId)) {
                await ctx.db.delete(row._id);
                if (row.uploadId) await releaseUpload(ctx, row.uploadId);
            } else {
                stored.set(row.fileId, row);
            }
        }

        // Legacy snippets kept everything in `filesJson`. A partial save would
        // drop the files it didn't mention, so move them into rows first.
        if (storedFiles.length === 0 && snippet?.filesJson) {
            const legacy = JSON.parse(snippet.filesJson) as CodeFileArg[];
            for (const file of legacy) {
                if (!keep.has(file.id) || stored.has(file.id)) continue;
                const rowId = await ctx.db.insert("snippetFiles", toRow(snippetId, file));
                const row = await ctx.db.get(rowId);
                if (row) stored.set(file.id, row);
            }
            await ctx.db.patch(snippetId, { filesJson: undefined });
        }

        // A partial save assumes every kept file it didn't resend is already
        // stored. If one isn't (another tab deleted or recreated the snippet),
        // applying the delta would quietly drop it; make the client resend all.
        const resent = new Set(args.files.map(file => file.id));
        for (const fileId of keep) {
            if (!stored.has(fileId) && !resent.has(fileId)) {
                throw new ConvexError({ code: "stale" satisfies SnippetErrorCode });
            }
        }

        for (const file of args.files) {
            const existing = stored.get(file.id);
            // A file keeping its upload (renamed, say) resends the same id; only
            // a new upload needs claiming.
            if (file.uploadId && file.uploadId !== existing?.uploadId) {
                await claimUpload(ctx, file.uploadId, snippetId);
            }

            const row = toRow(snippetId, file);
            if (!existing) {
                await ctx.db.insert("snippetFiles", row);
            } else if (
                existing.name !== row.name
                || existing.content !== row.content
                || existing.encoding !== row.encoding
                || existing.mimeType !== row.mimeType
                || existing.size !== row.size
                || existing.uploadId !== row.uploadId
            ) {
                await ctx.db.patch(existing._id, {
                    name: row.name,
                    content: row.content,
                    encoding: row.encoding,
                    mimeType: row.mimeType,
                    size: row.size,
                    uploadId: row.uploadId,
                });
                // The old content was replaced, or moved back inline.
                if (existing.uploadId && existing.uploadId !== row.uploadId) {
                    await releaseUpload(ctx, existing.uploadId);
                }
            }
        }

        // Patching to `undefined` deletes the field, and the editor never sends one.
        if (args.title !== undefined && snippet?.title !== args.title) {
            await ctx.db.patch(snippetId, { title: args.title });
        }
        return true;
    },
});
