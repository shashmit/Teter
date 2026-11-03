import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    sites: defineTable({
        customId: v.string(),
        snippetId: v.id("snippets"),
    }).index("by_customId", ["customId"]),
    snippets: defineTable({
        shortId: v.optional(v.string()),
        filesJson: v.optional(v.string()),
        title: v.optional(v.string()),
    }).index("by_shortId", ["shortId"]),
    snippetFiles: defineTable({
        snippetId: v.id("snippets"),
        fileId: v.string(),
        name: v.string(),
        content: v.string(),
        encoding: v.optional(v.literal("base64")),
        mimeType: v.optional(v.string()),
        size: v.optional(v.number()),
        /*
         * Set when the file's content was too large for one document (Convex
         * caps those at 1 MiB). `content` is then empty and the real content
         * lives in `uploadChunks`; see uploads.ts.
         */
        uploadId: v.optional(v.id("uploads")),
    }).index("by_snippetId", ["snippetId"]),
    /** A file's content split across `uploadChunks`, written over several requests. */
    uploads: defineTable({
        chunkCount: v.number(),
        /** Distinct chunks stored so far; the upload is usable once this equals `chunkCount`. */
        received: v.number(),
        /** Unset until a save attaches the upload to a snippet file. */
        snippetId: v.optional(v.id("snippets")),
    }).index("by_snippetId", ["snippetId"]),
    uploadChunks: defineTable({
        uploadId: v.id("uploads"),
        index: v.number(),
        data: v.string(),
    }).index("by_upload", ["uploadId", "index"]),
});
