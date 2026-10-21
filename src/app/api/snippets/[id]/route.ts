import { NextResponse } from 'next/server';
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

interface SnippetResponse {
    shortId: string;
    title?: string;
    files: CodeFilePayload[];
    _creationTime: number;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) {
            return NextResponse.json({ error: 'Convex URL not configured' }, { status: 500 });
        }
        const convex = new ConvexHttpClient(convexUrl);
        const convexClient = convex as unknown as {
            query: (name: string, args: unknown) => Promise<unknown>;
        };
        const { id } = await params;

        const snippet = await convexClient.query("snippets:getByShortId", { shortId: id }) as SnippetResponse | null;

        if (!snippet) {
            return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
        }

        return NextResponse.json({
            id: snippet.shortId,
            title: snippet.title,
            files: snippet.files,
            createdAt: snippet._creationTime,
        });
    } catch (error) {
        console.error('Failed to get snippet:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) {
            return NextResponse.json({ error: 'Convex URL not configured' }, { status: 500 });
        }
        const convex = new ConvexHttpClient(convexUrl);
        const convexClient = convex as unknown as {
            mutation: (name: string, args: unknown) => Promise<unknown>;
        };
        const { id } = await params;

        const success = await convexClient.mutation("snippets:removeByShortId", { shortId: id }) as boolean;

        if (!success) {
            return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete snippet:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) {
            return NextResponse.json({ error: 'Convex URL not configured' }, { status: 500 });
        }
        const convex = new ConvexHttpClient(convexUrl);
        const convexClient = convex as unknown as {
            mutation: (name: string, args: unknown) => Promise<unknown>;
        };
        const { id } = await params;
        const body = await request.json();
        /*
         * `fileIds`, when present, is the full list of files to keep and `files`
         * only the ones that changed, so autosave doesn't resend every file.
         */
        const { title, files, fileIds } = body as { title?: string; files?: CodeFilePayload[]; fileIds?: string[] };

        if (!Array.isArray(files)) {
            return NextResponse.json({ error: 'Files are required' }, { status: 400 });
        }
        if (fileIds !== undefined && (!Array.isArray(fileIds) || fileIds.some(fileId => typeof fileId !== 'string'))) {
            return NextResponse.json({ error: 'fileIds must be a list of file ids' }, { status: 400 });
        }
        if ((fileIds ?? files).length === 0) {
            return NextResponse.json({ error: 'Files are required' }, { status: 400 });
        }

        const success = await convexClient.mutation("snippets:update", { shortId: id, files, fileIds, title: title || undefined }) as boolean;

        if (!success) {
            return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
        }

        // Echoing `files` back would return the whole upload for nothing.
        return NextResponse.json({ id, title }, { status: 200 });
    } catch (error) {
        if (error instanceof ConvexError && (error.data as { code?: string } | undefined)?.code === 'stale') {
            return NextResponse.json({ error: 'Snippet changed elsewhere', code: 'stale' }, { status: 409 });
        }
        console.error('Failed to update snippet:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
