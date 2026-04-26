import { useEffect, useState } from 'react';
import type { RecentFile } from '../types';
import { usePdfStore } from '../state/pdfStore';

export interface EmptyStateProps {
  onOpen: () => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
}

export function EmptyState(props: EmptyStateProps): JSX.Element {
  const { onOpen, onOpenPath } = props;
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const commandPaletteOpen = usePdfStore((s) => s.commandPaletteOpen);

  useEffect(() => {
    let cancelled = false;
    void window.api
      .getRecents()
      .then((list) => {
        if (!cancelled) setRecents(list.slice(0, 5));
      })
      .catch(() => setRecents([]));
    return (): void => {
      cancelled = true;
    };
  }, [commandPaletteOpen]);

  return (
    <div id="empty-state">
      <button
        type="button"
        className="drop-zone"
        aria-label="Open a PDF file"
        onClick={() => void onOpen()}
      >
        <h1>
          Drop a PDF<em>.</em>
        </h1>
        <p>
          Or click to open. Parchment handles viewing, annotating, reordering, rotating, deleting,
          and merging pages. Your file never leaves your machine.
        </p>
        <div className="hotkey">
          <span>
            <kbd>V</kbd> select
          </span>
          <span>
            <kbd>H</kbd> highlight
          </span>
          <span>
            <kbd>D</kbd> draw
          </span>
          <span>
            <kbd>Ctrl-O</kbd> open
          </span>
          <span>
            <kbd>Ctrl-K</kbd> command
          </span>
          <span>
            <kbd>Ctrl-S</kbd> save
          </span>
        </div>
      </button>
      {recents.length > 0 && (
        <div className="recents-list">
          <div className="recents-label">Recent</div>
          {recents.map((r) => (
            <button
              key={r.path}
              type="button"
              className="recents-item"
              onClick={(e) => {
                e.stopPropagation();
                void onOpenPath(r.path);
              }}
              title={r.path}
            >
              <span className="recents-name">{r.name}</span>
              <span className="recents-path">{r.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
