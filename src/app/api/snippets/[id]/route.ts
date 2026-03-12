import { NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";

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
        const { id } = await params;

        const snippet: any = await convex.query("snippets:getByShortId" as any, { shortId: id });

        if (!snippet) {
            return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
        }

        return NextResponse.json({
            id: snippet.shortId,
            title: snippet.title,
            files: JSON.parse(snippet.filesJson),
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
        const { id } = await params;

        const success: boolean = await convex.mutation("snippets:removeByShortId" as any, { shortId: id });

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
        const { id } = await params;
        const body = await request.json();
        const { title, files } = body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return NextResponse.json({ error: 'Files are required' }, { status: 400 });
        }

        const filesJson = JSON.stringify(files);
        const success = await convex.mutation("snippets:update" as any, { shortId: id, filesJson, title: title || undefined });

        if (!success) {
            return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
        }

        return NextResponse.json({ id, title, files }, { status: 200 });
    } catch (error) {
        console.error('Failed to update snippet:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
