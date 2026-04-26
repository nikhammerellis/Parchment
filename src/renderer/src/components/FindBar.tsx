import { KeyboardEvent, useEffect, useRef } from 'react';
import { usePdfStore } from '../state/pdfStore';

/*
 * A slim bar that drops in under the toolbar while find is active. The bar
 * overlays the page-scroll area (doesn't push content) — simpler than
 * reflowing the grid and the user's scroll position survives.
 */

export function FindBar(): JSX.Element | null {
  const isOpen = usePdfStore((s) => s.findState.isOpen);
  const query = usePdfStore((s) => s.findState.query);
  const matches = usePdfStore((s) => s.findState.matches);
  const currentMatch = usePdfStore((s) => s.findState.currentMatch);
  const isSearching = usePdfStore((s) => s.findState.isSearching);
  const setFindQuery = usePdfStore((s) => s.setFindQuery);
  const closeFind = usePdfStore((s) => s.closeFind);
  const nextMatch = usePdfStore((s) => s.nextMatch);
  const prevMatch = usePdfStore((s) => s.prevMatch);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
    return (): void => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          // element may have unmounted
        }
      }
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFind();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prevMatch();
      else nextMatch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextMatch();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      prevMatch();
    }
  };

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasMatches = matches.length > 0;
  const statusText = isSearching
    ? 'Searching…'
    : hasQuery && !hasMatches
      ? 'No matches'
      : hasMatches
        ? `${currentMatch >= 0 ? currentMatch + 1 : 0} of ${matches.length}`
        : '';

  const statusClass = hasQuery && !hasMatches && !isSearching ? 'find-bar-status danger' : 'find-bar-status';

  return (
    <div className="find-bar" role="search" aria-label="Find in document">
      <span className="find-bar-label">Find:</span>
      <input
        ref={inputRef}
        type="text"
        className="find-bar-input"
        value={query}
        onChange={(e): void => setFindQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        aria-label="Find text"
        spellCheck={false}
      />
      <span className={statusClass} aria-live="polite">{statusText}</span>
      <button
        type="button"
        className="find-bar-btn"
        aria-label="Previous match"
        title="Previous (Shift+Enter)"
        onClick={prevMatch}
        disabled={!hasMatches}
      >
        ▲
      </button>
      <button
        type="button"
        className="find-bar-btn"
        aria-label="Next match"
        title="Next (Enter)"
        onClick={nextMatch}
        disabled={!hasMatches}
      >
        ▼
      </button>
      <button
        type="button"
        className="find-bar-btn find-bar-close"
        aria-label="Close find"
        title="Close (Esc)"
        onClick={closeFind}
      >
        ×
      </button>
    </div>
  );
}
