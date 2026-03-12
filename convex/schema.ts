import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    snippets: defineTable({
        shortId: v.string(),
        filesJson: v.string(),
        title: v.optional(v.string()),
    }).index("by_shortId", ["shortId"]),
});
