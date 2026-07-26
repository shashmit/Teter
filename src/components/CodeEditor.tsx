'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { HighlighterCore } from 'shiki/core';

import {
  GUTTER_MAX_LINES,
  HIGHLIGHT_MAX_BYTES,
  loadHighlighter,
  resolveLanguage,
  tokenFontStyle,
  tokenizeLines,
} from '@/lib/highlight';

/** Inserted by Tab. A real tab keeps existing files byte-identical on round-trip. */
const INDENT = '\t';
/** Widest run of spaces Shift+Tab will strip when a line is space-indented. */
const MAX_SPACE_OUTDENT = 4;

interface CodeEditorProps {
  value: string;
  fileName: string;
  readOnly: boolean;
  wrap: boolean;
  onChange: (next: string) => void;
}

/**
 * Applies an edit through `execCommand('insertText')` so the browser's native
 * undo stack survives. Assigning `.value` directly would wipe undo history,
 * which matters a lot once Tab starts rewriting whole selections.
 */
function replaceRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  selectionStart: number,
  selectionEnd: number,
  onChange: (next: string) => void,
) {
  textarea.focus();
  textarea.setSelectionRange(start, end);

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    // Fallback path: correct, but the edit becomes a new undo baseline.
    const next = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.value = next;
    onChange(next);
  }

  textarea.setSelectionRange(selectionStart, selectionEnd);
}

/** Indents or outdents every line touched by [start, end]. */
function shiftBlock(
  textarea: HTMLTextAreaElement,
  outdent: boolean,
  onChange: (next: string) => void,
) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const blockStart = value.lastIndexOf('\n', start - 1) + 1;
  const newlineAfter = value.indexOf('\n', end);
  const blockEnd = newlineAfter === -1 ? value.length : newlineAfter;

  const lines = value.slice(blockStart, blockEnd).split('\n');
  let firstLineDelta = 0;
  let totalDelta = 0;

  const shifted = lines.map((line, index) => {
    let next: string;

    if (outdent) {
      if (line.startsWith(INDENT)) {
        next = line.slice(INDENT.length);
      } else {
        const spaces = line.length - line.trimStart().length;
        const strip = Math.min(spaces, MAX_SPACE_OUTDENT);
        next = line.slice(strip);
      }
    } else {
      // Don't indent trailing empty lines pulled in by a selection.
      next = line.length === 0 && index === lines.length - 1 ? line : INDENT + line;
    }

    const delta = next.length - line.length;
    if (index === 0) firstLineDelta = delta;
    totalDelta += delta;
    return next;
  });

  if (totalDelta === 0) return;

  // Keep the same lines selected after the shift.
  const nextStart = Math.max(blockStart, start + firstLineDelta);
  const nextEnd = Math.max(nextStart, end + totalDelta);

  replaceRange(textarea, blockStart, blockEnd, shifted.join('\n'), nextStart, nextEnd, onChange);
}

/** Shape shared by shiki's tokens and the unhighlighted fallback. */
interface RenderToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export default function CodeEditor({ value, fileName, readOnly, wrap, onChange }: CodeEditorProps) {
  const [loaded, setLoaded] = useState<{ language: string; highlighter: HighlighterCore } | null>(null);

  const language = useMemo(() => resolveLanguage(fileName), [fileName]);

  // Very large files skip both highlighting and the per-line gutter: tokenizing
  // on every keystroke or rendering 20k line elements would stall typing.
  const isTooLargeToHighlight = value.length > HIGHLIGHT_MAX_BYTES;
  const lineCount = useMemo(() => {
    let count = 1;
    for (let index = 0; index < value.length; index += 1) {
      if (value.charCodeAt(index) === 10) count += 1;
    }
    return count;
  }, [value]);
  const isPlainMode = isTooLargeToHighlight || lineCount > GUTTER_MAX_LINES;

  useEffect(() => {
    if (!language || isPlainMode) return;

    let active = true;
    void loadHighlighter(language).then((highlighter) => {
      if (active && highlighter) setLoaded({ language, highlighter });
    });

    return () => {
      active = false;
    };
  }, [language, isPlainMode]);

  // Guarding on the language the highlighter was loaded for keeps a stale
  // grammar from being applied during the async load of a new one.
  const highlighter = !isPlainMode && language && loaded?.language === language
    ? loaded.highlighter
    : null;

  const lines = useMemo<RenderToken[][] | null>(() => {
    if (isPlainMode) return null;

    if (highlighter && language) {
      const tokenized = tokenizeLines(highlighter, value, language);
      if (tokenized) {
        // A trailing newline gives the textarea one more (empty) line than shiki
        // reports. Pad so every visual line keeps a number and the two boxes
        // stay the same height.
        while (tokenized.length < lineCount) tokenized.push([]);
        return tokenized.slice(0, lineCount);
      }
    }

    // Unhighlighted fallback shaped like shiki's output so rendering is uniform.
    return value.split('\n').map((line) => [{ content: line, color: undefined }]);
  }, [highlighter, language, value, isPlainMode, lineCount]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;

    // Tab is captured for indentation, so Escape becomes the way to move focus
    // out of the editor with a keyboard.
    if (event.key === 'Escape') {
      textarea.blur();
      return;
    }

    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (readOnly) return;

    event.preventDefault();

    const { selectionStart, selectionEnd, value: current } = textarea;
    const spansLines = current.slice(selectionStart, selectionEnd).includes('\n');

    if (event.shiftKey || spansLines) {
      shiftBlock(textarea, event.shiftKey, onChange);
      return;
    }

    const caret = selectionStart + INDENT.length;
    replaceRange(textarea, selectionStart, selectionEnd, INDENT, caret, caret, onChange);
  };

  // A monospace `ch` unit makes the gutter exactly as wide as its digits, which
  // is what keeps the overlay and the textarea's text column aligned.
  const gutterDigits = Math.max(2, String(lineCount).length);

  return (
    <div
      className={`code-surface ${wrap ? 'is-wrapped' : ''} ${isPlainMode ? 'is-plain' : ''}`}
      style={{ ['--gutter-width' as string]: `calc(${gutterDigits}ch + 28px)` }}
    >
      <div className="code-inner">
        {lines && (
          <pre className="code-overlay" aria-hidden="true">
            {lines.map((tokens, lineIndex) => (
              <div className="code-line" key={lineIndex}>
                <span className="code-line-number">{lineIndex + 1}</span>
                <span className="code-line-content">
                  {tokens.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      style={{ color: token.color, ...tokenFontStyle(token.fontStyle) }}
                    >
                      {token.content}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}

        <textarea
          className="code-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder="Paste your code here..."
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          wrap={wrap ? 'soft' : 'off'}
          aria-label={`Contents of ${fileName.split('/').pop() || fileName}`}
          aria-describedby="code-editor-help"
        />
      </div>

      <p id="code-editor-help" className="sr-only">
        Press Tab to indent and Shift plus Tab to outdent. Press Escape to move focus out of the editor.
      </p>
    </div>
  );
}
