'use client';

import { startTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Shown when a snippet couldn't be loaded (e.g. the database is unreachable),
 * as opposed to not-found, which means it doesn't exist.
 *
 * `reset()` alone only re-renders on the client and can't recover from a
 * Server Component error, so Retry refreshes the route to re-run the server
 * render first. A transient outage then recovers without a full reload.
 */
export default function SnippetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('Failed to load snippet:', error);
  }, [error]);

  return (
    <main className="landing-container animate-fade-in">
      <div className="hero-message" role="alert">
        <AlertTriangle size={48} strokeWidth={1} />
        <p>This snippet couldn&apos;t be loaded right now</p>
        <span>It hasn&apos;t been deleted. This is usually temporary.</span>
        <button
          className="btn btn-primary"
          onClick={() => startTransition(() => {
            router.refresh();
            reset();
          })}
        >
          <RotateCcw size={14} />
          Try again
        </button>
      </div>
    </main>
  );
}
