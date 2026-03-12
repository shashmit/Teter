import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConvexHttpClient } from "convex/browser";
import Editor, { CodeFile } from '@/components/Editor';

interface SnippetData {
    shortId: string;
    filesJson: string;
    title?: string;
}

async function getSnippet(id: string): Promise<{ files: CodeFile[]; title?: string } | null> {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) return null;

        const convex = new ConvexHttpClient(convexUrl);
        const snippet = await convex.query("snippets:getByShortId" as any, { shortId: id }) as SnippetData | null;

        if (!snippet) return null;

        return {
            files: JSON.parse(snippet.filesJson) as CodeFile[],
            title: snippet.title,
        };
    } catch (err) {
        console.error('Failed to parse snippet data:', err);
        return null;
    }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const snippet = await getSnippet(id);

    if (!snippet) {
        return { title: 'Snippet Not Found' };
    }

    const fileNames = snippet.files.map(f => f.name.split('/').pop()).join(', ');
    const fileCount = snippet.files.length;
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
