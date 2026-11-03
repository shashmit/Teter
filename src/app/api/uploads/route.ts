import { NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";

/** Starts a chunked upload for a file too large to save in one request. */
export async function POST(request: Request) {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) {
            return NextResponse.json({ error: 'Convex URL not configured' }, { status: 500 });
        }
        const convex = new ConvexHttpClient(convexUrl);
        const convexMutations = convex as unknown as {
            mutation: (name: string, args: unknown) => Promise<unknown>;
        };

        const { chunkCount } = await request.json() as { chunkCount?: unknown };
        if (typeof chunkCount !== 'number') {
            return NextResponse.json({ error: 'chunkCount is required' }, { status: 400 });
        }

        const uploadId = await convexMutations.mutation("uploads:create", { chunkCount });
        return NextResponse.json({ uploadId }, { status: 201 });
    } catch (error) {
        if (error instanceof ConvexError && (error.data as { code?: string } | undefined)?.code === 'invalid_upload') {
            return NextResponse.json({ error: 'File is too large to upload' }, { status: 413 });
        }
        console.error('Failed to start upload:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
