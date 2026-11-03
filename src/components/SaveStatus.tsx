'use client';

import React from 'react';
import { AlertTriangle, Check, Cloud, Loader2, RotateCcw } from 'lucide-react';

export type SaveState =
  | { status: 'idle' | 'unsaved' | 'saved' }
  /** `progress` (0–1) is set while large files upload ahead of the save. */
  | { status: 'saving'; progress?: number }
  | { status: 'error'; message: string };

interface SaveStatusProps {
  state: SaveState;
  /** Whether edits persist automatically; drives the wording for `unsaved`. */
  autoSaves: boolean;
  onRetry: () => void;
}

export default function SaveStatus({ state, autoSaves, onRetry }: SaveStatusProps) {
  // Nothing meaningful to report on an untouched, never-saved draft.
  if (state.status === 'idle') return null;

  if (state.status === 'error') {
    return (
      <div className="save-status is-error" role="status" title={state.message}>
        <AlertTriangle size={13} />
        <span className="save-status-label">
          {state.message}
        </span>
        <button type="button" className="save-status-retry" onClick={onRetry}>
          <RotateCcw size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (state.status === 'saving') {
    return (
      <div className="save-status is-saving" role="status">
        <Loader2 size={13} className="animate-spin" />
        <span className="save-status-label">
          {state.progress === undefined ? 'Saving…' : `Uploading ${Math.floor(state.progress * 100)}%`}
        </span>
      </div>
    );
  }

  if (state.status === 'unsaved') {
    return (
      <div className="save-status is-unsaved" role="status">
        <Cloud size={13} />
        <span className="save-status-label">
          {autoSaves ? 'Unsaved…' : 'Unsaved'}
        </span>
      </div>
    );
  }

  return (
    <div className="save-status is-saved" role="status">
      <Check size={13} />
      <span className="save-status-label">Saved</span>
    </div>
  );
}
