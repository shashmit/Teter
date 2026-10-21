import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";

interface CodeFilePayload {
    id: string;
    name: string;
    content: string;
    encoding?: 'base64';
    mimeType?: string;
    size?: number;
}

/**
 * Mirrors the landing page's check. It has to live here too: a client-only
 * check let ids like `a/b` or `x?y` through, creating snippets whose URL
 * could never resolve to them.
 */
const SHORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function generateShortId(length = 7) {
    return crypto.randomBytes(length).toString('base64url').substring(0, length);
}

export async function POST(request: Request) {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) {
            return NextResponse.json({ error: 'Convex URL not configured. Please run `npx convex dev`.' }, { status: 500 });
        }
        const convex = new ConvexHttpClient(convexUrl);
        const convexMutations = convex as unknown as {
            mutation: (name: string, args: unknown) => Promise<unknown>;
        };

        const body = await request.json();
        const { title, files, shortId: requestedShortId } = body as { title?: string; files?: CodeFilePayload[], shortId?: string };

        if (!files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json({ error: 'Files are required' }, { status: 400 });
        }

        // Empty or null still means "generate one", as before.
        if (requestedShortId != null && requestedShortId !== '' && (typeof requestedShortId !== 'string' || !SHORT_ID_PATTERN.test(requestedShortId))) {
            return NextResponse.json({ error: 'Site ID may only use letters, numbers, hyphens and underscores (max 64)' }, { status: 400 });
        }

        const shortId = requestedShortId || generateShortId();
        await convexMutations.mutation("snippets:create", { shortId, files, title: title || undefined });

        return NextResponse.json({ id: shortId, title }, { status: 201 });
    } catch (error) {
        console.error('Failed to save snippet:', error);
        if (error instanceof ConvexError && (error.data as { code?: string } | undefined)?.code === 'already_exists') {
            return NextResponse.json({ error: 'Snippet ID already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
