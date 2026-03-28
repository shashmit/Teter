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
    }).index("by_snippetId", ["snippetId"]),
});
