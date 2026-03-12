import { notFound } from 'next/navigation';
import { ConvexHttpClient } from "convex/browser";
import Editor, { CodeFile } from '@/components/Editor';

interface SnippetData {
    shortId: string;
    filesJson: string;
    title?: string;
}

async function getSnippet(id: string): Promise<CodeFile[]> {
    try {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
        if (!convexUrl) return [];

        const convex = new ConvexHttpClient(convexUrl);
        const snippet = await convex.query("snippets:getByShortId" as any, { shortId: id }) as SnippetData | null;

        if (!snippet) {
            return [];
        }

        return JSON.parse(snippet.filesJson) as CodeFile[];
    } catch (err) {
        console.error('Failed to parse snippet data:', err);
        return [];
    }
}

export default async function SnippetPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const initialFiles = await getSnippet(id);

    if (!initialFiles.length) {
        notFound();
    }

    return (
        <main className="animate-fade-in">
            <Editor initialFiles={initialFiles} snippetId={id} isReadOnly={true} />
        </main>
    );
}
