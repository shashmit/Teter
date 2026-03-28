import type { Metadata } from 'next';
import Landing from '@/components/Landing';

export const metadata: Metadata = {
  title: 'Create & Share Code Snippets',
  description:
    'Create multi-file code or text snippets and share them instantly with a short link. Supports folders, drag-and-drop, and auto-save. Free, no signup.',
  alternates: {
    canonical: '/',
  },
};

export default function Home() {
  return (
    <main className="landing-container animate-fade-in">
      <Landing />
    </main>
  );
}
