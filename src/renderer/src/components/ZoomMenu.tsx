import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import type { ZoomMode } from '../types';

const PRESETS: Array<{ mode: ZoomMode; label: string; shortcut?: string }> = [
  { mode: 'fit-width', label: 'Fit Width' },
  { mode: 'fit-page', label: 'Fit Page', shortcut: 'Ctrl+0' },
  { mode: 'actual', label: 'Actual Size', shortcut: 'Ctrl+1' }
];

export function ZoomMenu(): JSX.Element {
  const scale = usePdfStore((s) => s.scale);
  const zoomMode = usePdfStore((s) => s.zoomMode);
  const setZoomMode = usePdfStore((s) => s.setZoomMode);
  const pagesLength = usePdfStore((s) => s.pages.length);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return (): void => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      });
    } else if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  const activeLabel = zoomMode === 'custom'
    ? `${Math.round(scale * 100)}%`
    : zoomMode === 'actual'
      ? '100%'
      : zoomMode === 'fit-width'
        ? 'Fit W'
        : 'Fit Pg';

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const list = Array.from(items);
    const currentIndex = list.indexOf(document.activeElement as HTMLElement);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + list.length) % list.length;
    list[nextIndex]?.focus();
  };

  return (
    <div className="zoom-menu" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="tool-btn zoom-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={pagesLength === 0}
        title="Zoom presets"
        aria-label="Zoom presets"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {activeLabel}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="zoom-menu-popover"
          role="menu"
          onKeyDown={onMenuKeyDown}
        >
          {PRESETS.map((preset) => (
            <button
              key={preset.mode}
              type="button"
              role="menuitem"
              className={`zoom-menu-item ${zoomMode === preset.mode ? 'active' : ''}`}
              onClick={() => {
                setZoomMode(preset.mode);
                setOpen(false);
              }}
            >
              <span>{preset.label}</span>
              {preset.shortcut && <span className="zoom-menu-shortcut">{preset.shortcut}</span>}
            </button>
          ))}
          <div className="zoom-menu-separator" />
          <div className="zoom-menu-current">{Math.round(scale * 100)}%</div>
        </div>
      )}
    </div>
  );
}
