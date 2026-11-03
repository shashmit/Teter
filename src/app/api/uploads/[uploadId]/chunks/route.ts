import { NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";

/*
 * Chunk transfer for uploads. Each request carries only a few chunks (see
 * BATCH_BYTES in convex/uploadLimits.ts) so it stays under Vercel's 4.5 MB
 * request and response limit.
 */

function getConvex() {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) return null;
    return new ConvexHttpClient(convexUrl) as unknown as {
        query: (name: string, args: unknown) => Promise<unknown>;
        mutation: (name: string, args: unknown) => Promise<unknown>;
    };
}

function errorCode(error: unknown) {
    return error instanceof ConvexError ? (error.data as { code?: string } | undefined)?.code : undefined;
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ uploadId: string }> }
) {
    try {
        const convex = getConvex();
        if (!convex) {
            return NextResponse.json({ error: 'Convex URL not configured' }, { status: 500 });
        }
        const { uploadId } = await params;
        const { chunks } = await request.json() as { chunks?: unknown };

        const valid = Array.isArray(chunks) && chunks.length > 0 && chunks.every(chunk =>
            chunk && typeof chunk.index === 'number' && typeof chunk.data === 'string'
        );
        if (!valid) {
            return NextResponse.json({ error: 'chunks must be a list of { index, data }' }, { status: 400 });
        }

        await convex.mutation("uploads:putChunks", { uploadId, chunks });
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        const code = errorCode(error);
        if (code === 'upload_missing') {
            return NextResponse.json({ error: 'Upload not found', code }, { status: 404 });
        }
        if (code === 'invalid_upload') {
            return NextResponse.json({ error: 'Invalid chunk', code }, { status: 400 });
        }
        console.error('Failed to store upload chunks:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ uploadId: string }> }
) {
    try {
        const convex = getConvex();
        if (!convex) {
            return NextResponse.json({ error: 'Convex URL not configured' }, { status: 500 });
        }
        const { uploadId } = await params;
        const from = Number(new URL(request.url).searchParams.get('from') ?? 0);
        if (!Number.isInteger(from) || from < 0) {
            return NextResponse.json({ error: 'from must be a chunk index' }, { status: 400 });
        }

        const result = await convex.query("uploads:readChunks", { uploadId, from });
        if (!result) {
            return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
        }
        // Claimed uploads never change, so a chunk range can be cached for good.
        return NextResponse.json(result, {
            headers: { 'Cache-Control': 'private, max-age=31536000, immutable' },
        });
    } catch (error) {
        console.error('Failed to read upload chunks:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
