import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ConvexHttpClient } from "convex/browser";
import Editor, { CodeFile } from '@/components/Editor';

interface SnippetData {
    shortId: string;
    files: CodeFile[];
    title?: string;
}

/*
 * Memoized per request: generateMetadata and the page both need the snippet,
 * and without this every view queried Convex twice for every file's contents.
 *
 * Returns null only when the snippet genuinely doesn't exist. Failures throw
 * so they reach error.tsx: catching them here used to turn a Convex outage or
 * a missing env var into a 404, telling visitors their snippet was gone.
 */
const getSnippet = cache(async (id: string): Promise<{ files: CodeFile[]; title?: string } | null> => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
        throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
    }

    const convex = new ConvexHttpClient(convexUrl);
    const convexQueries = convex as unknown as {
        query: (name: string, args: unknown) => Promise<unknown>;
    };
    const snippet = await convexQueries.query("snippets:getByShortId", { shortId: id }) as SnippetData | null;

    if (!snippet) return null;

    return {
        files: snippet.files,
        title: snippet.title,
    };
});

/** Enough names to describe the snippet without a 1000-file meta tag. */
const DESCRIPTION_MAX_NAMES = 5;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const snippet = await getSnippet(id);

    if (!snippet) {
        return { title: 'Snippet Not Found' };
    }

    const fileCount = snippet.files.length;
    const fileNames = snippet.files
        .slice(0, DESCRIPTION_MAX_NAMES)
        .map(f => f.name.split('/').pop())
        .join(', ') + (fileCount > DESCRIPTION_MAX_NAMES ? `, and ${fileCount - DESCRIPTION_MAX_NAMES} more` : '');
    const title = snippet.title || `Shared Snippet (${fileCount} file${fileCount > 1 ? 's' : ''})`;
    const description = `View shared code snippet with ${fileCount} file${fileCount > 1 ? 's' : ''}: ${fileNames}. Open in Teter to copy, edit, or reshare.`;

    return {
        title,
        description,
        openGraph: {
            title: `${title} | Teter`,
            description,
            type: 'article',
        },
        twitter: {
            card: 'summary',
            title: `${title} | Teter`,
            description,
        },
        robots: {
            index: false,
            follow: true,
        },
    };
}

export default async function SnippetPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const snippet = await getSnippet(id);

    if (!snippet || !snippet.files.length) {
        notFound();
    }

    return (
        <main className="animate-fade-in">
            <Editor initialFiles={snippet.files} snippetId={id} isReadOnly={true} />
        </main>
    );
}
