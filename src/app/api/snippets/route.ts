import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ConvexHttpClient } from "convex/browser";

interface CodeFilePayload {
    id: string;
    name: string;
    content: string;
}

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

        const shortId = requestedShortId ? requestedShortId.slice(0, 64) : generateShortId();
        await convexMutations.mutation("snippets:create", { shortId, files, title: title || undefined });

        return NextResponse.json({ id: shortId, title, files }, { status: 201 });
    } catch (error) {
        console.error('Failed to save snippet:', error);
        if (error instanceof Error && error.message.includes('already exists')) {
            return NextResponse.json({ error: 'Snippet ID already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
