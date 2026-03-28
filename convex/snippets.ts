import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const codeFileValidator = v.object({
    id: v.string(),
    name: v.string(),
    content: v.string(),
});

export const create = mutation({
    args: {
        shortId: v.string(),
        files: v.array(codeFileValidator),
        title: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        // Check if site already exists
        const existingSite = await ctx.db.query("sites")
            .withIndex("by_customId", q => q.eq("customId", args.shortId))
            .first();
        if (existingSite) {
            throw new Error("Snippet ID already exists");
        }

        // Fallback check: ensure old snippets don't conflict
        const existingSnippet = await ctx.db.query("snippets")
            .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
            .first();
        if (existingSnippet) {
            throw new Error("Snippet ID already exists");
        }

        const snippetId = await ctx.db.insert("snippets", {
            title: args.title,
        });

        await ctx.db.insert("sites", {
            customId: args.shortId,
            snippetId: snippetId,
        });

        await Promise.all(
            args.files.map((file) =>
                ctx.db.insert("snippetFiles", {
                    snippetId,
                    fileId: file.id,
                    name: file.name,
                    content: file.content,
                })
            )
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
        const site = await ctx.db.query("sites")
            .withIndex("by_customId", q => q.eq("customId", args.shortId))
            .first();
        if (site) return true;

        const snippet = await ctx.db.query("snippets")
            .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
            .first();
        return snippet !== null;
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
            await Promise.all(storedFiles.map((file) => ctx.db.delete(file._id)));
            await ctx.db.delete(snippetId);
            return true;
        }
        return false;
    },
});

export const update = mutation({
    args: {
        shortId: v.string(),
        files: v.array(codeFileValidator),
        title: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        let snippetId = null;

        const site = await ctx.db.query("sites")
            .withIndex("by_customId", q => q.eq("customId", args.shortId))
            .first();

        if (site) {
            snippetId = site.snippetId;
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
            await Promise.all(storedFiles.map((file) => ctx.db.delete(file._id)));
            
            await Promise.all(
                args.files.map((file) =>
                    ctx.db.insert("snippetFiles", {
                        snippetId: snippetId!,
                        fileId: file.id,
                        name: file.name,
                        content: file.content,
                    })
                )
            );
            await ctx.db.patch(snippetId, {
                title: args.title
            });
            return true;
        }
        return false;
    },
});
