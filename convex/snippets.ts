import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
    args: {
        shortId: v.string(),
        filesJson: v.string(),
        title: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("snippets", {
            shortId: args.shortId,
            filesJson: args.filesJson,
            title: args.title,
        });
    },
});

export const getByShortId = query({
    args: { shortId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db.query("snippets")
            .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
            .first();
    },
});

export const removeByShortId = mutation({
    args: { shortId: v.string() },
    handler: async (ctx, args) => {
        const snippet = await ctx.db.query("snippets")
            .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
            .first();

        if (snippet) {
            await ctx.db.delete(snippet._id);
            return true;
        }
        return false;
    },
});

export const update = mutation({
    args: {
        shortId: v.string(),
        filesJson: v.string(),
        title: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const snippet = await ctx.db.query("snippets")
            .withIndex("by_shortId", q => q.eq("shortId", args.shortId))
            .first();

        if (snippet) {
            await ctx.db.patch(snippet._id, {
                filesJson: args.filesJson,
                title: args.title
            });
            return true;
        }
        return false;
    },
});
