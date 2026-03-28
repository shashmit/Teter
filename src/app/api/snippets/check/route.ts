import { NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) {
            return NextResponse.json({ error: 'Convex URL not configured.' }, { status: 500 });
        }

        const convex = new ConvexHttpClient(convexUrl);
        const convexQueries = convex as unknown as {
            query: (name: string, args: unknown) => Promise<unknown>;
        };

        const exists = await convexQueries.query("snippets:exists", { shortId: id });

        return NextResponse.json({ exists }, { status: 200 });
    } catch (error) {
        console.error('Failed to check snippet existence:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
