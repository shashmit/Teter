import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ConvexHttpClient } from "convex/browser";

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

        const body = await request.json();
        const { title, files } = body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json({ error: 'Files are required' }, { status: 400 });
        }

        const shortId = generateShortId();
        const filesJson = JSON.stringify(files);

        await convex.mutation("snippets:create" as any, { shortId, filesJson, title: title || undefined });

        return NextResponse.json({ id: shortId, title, files }, { status: 201 });
    } catch (error) {
        console.error('Failed to save snippet:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
