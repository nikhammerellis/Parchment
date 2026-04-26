import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import { COLORS } from '../constants';
import type { Tool } from '../types';
import { ZoomMenu } from './ZoomMenu';
import {
  EraseIcon,
  FreehandIcon,
  HighlightIcon,
  NotesIcon,
  RotateIcon,
  SelectIcon,
  TrashIcon
} from './icons';

interface ToolDef {
  tool: Tool;
  title: string;
  icon: JSX.Element;
}

const TOOL_DEFS: ToolDef[] = [
  { tool: 'select', title: 'Select (V)', icon: <SelectIcon /> },
  { tool: 'highlight', title: 'Highlight (H)', icon: <HighlightIcon /> },
  { tool: 'draw', title: 'Freehand (D)', icon: <FreehandIcon /> },
  { tool: 'erase', title: 'Erase annotations on page (E)', icon: <EraseIcon /> }
];

export function Toolbar(): JSX.Element {
  const tool = usePdfStore((s) => s.tool);
  const color = usePdfStore((s) => s.color);
  const pagesLength = usePdfStore((s) => s.pages.length);
  const currentPage = usePdfStore((s) => s.currentPage);
  const currentPageAnnotationCount = usePdfStore(
    (s) => s.pages[s.currentPage]?.annotations.length ?? 0
  );
  const setTool = usePdfStore((s) => s.setTool);
  const setColor = usePdfStore((s) => s.setColor);
  const zoomIn = usePdfStore((s) => s.zoomIn);
  const zoomOut = usePdfStore((s) => s.zoomOut);
  const rotatePage = usePdfStore((s) => s.rotatePage);
  const deletePage = usePdfStore((s) => s.deletePage);
  const deleteSelectedPages = usePdfStore((s) => s.deleteSelectedPages);
  const selectionSize = usePdfStore((s) => s.selectedPages.size);
  const nextPage = usePdfStore((s) => s.nextPage);
  const prevPage = usePdfStore((s) => s.prevPage);
  const goToPage = usePdfStore((s) => s.goToPage);
  const marginNotesOpen = usePdfStore((s) => s.marginNotesOpen);
  const toggleMarginNotes = usePdfStore((s) => s.toggleMarginNotes);

  const hasPages = pagesLength > 0;
  const isBulkDelete = selectionSize > 1;
  const deleteTitle = isBulkDelete
    ? `Delete ${selectionSize} pages`
    : 'Delete current page';
  const deleteLabel = isBulkDelete
    ? `Delete ${selectionSize} selected pages`
    : 'Delete current page';
  // Bulk delete is blocked when it would empty the doc; single delete is
  // blocked when only one page exists.
  const deleteDisabled = !hasPages
    || (isBulkDelete ? selectionSize >= pagesLength : pagesLength <= 1);
  const onDeleteClick = (): void => {
    if (isBulkDelete) deleteSelectedPages();
    else deletePage(currentPage);
  };

  const [editingPage, setEditingPage] = useState(false);
  const [pageDraft, setPageDraft] = useState('');
  const pageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingPage) return;
    requestAnimationFrame(() => pageInputRef.current?.select());
  }, [editingPage]);

  // If the document changes under the editor, cancel the edit silently so we
  // don't commit a stale value against a different page count.
  useEffect(() => {
    if (editingPage) setEditingPage(false);
    // only react to doc-shape changes, not currentPage tick-by-tick edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesLength]);

  const commitPage = (): void => {
    const parsed = Number.parseInt(pageDraft, 10);
    if (Number.isFinite(parsed) && pagesLength > 0) {
      const clamped = Math.max(1, Math.min(pagesLength, parsed));
      goToPage(clamped - 1);
    }
    setEditingPage(false);
  };

  const onPageInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPage();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPageDraft(String(currentPage + 1));
      setEditingPage(false);
    }
  };

  const startEditPage = (): void => {
    if (!hasPages) return;
    setPageDraft(String(currentPage + 1));
    setEditingPage(true);
  };

  return (
    <div id="toolbar">
      <div className="tool-group">
        <span className="label">Tool</span>
        {TOOL_DEFS.map((def) => {
          const isErase = def.tool === 'erase';
          const disabled = isErase
            ? !hasPages || currentPageAnnotationCount === 0
            : false;
          return (
            <button
              key={def.tool}
              type="button"
              className={`tool-btn ${tool === def.tool ? 'active' : ''}`}
              title={def.title}
              aria-label={def.title}
              aria-pressed={tool === def.tool}
              onClick={() => setTool(def.tool)}
              disabled={disabled}
            >
              {def.icon}
            </button>
          );
        })}
      </div>

      <div className="tool-group">
        <span className="label">Color</span>
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`color-swatch ${color === c.value ? 'active' : ''}`}
            style={{
              background: c.value,
              borderColor: c.value === '#000000' && color !== c.value ? '#444' : undefined
            }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={color === c.value}
            onClick={() => setColor(c.value)}
          />
        ))}
      </div>

      <div className="tool-group">
        <span className="label">Page</span>
        <button
          type="button"
          className="tool-btn"
          title="Rotate current page 90° (R)"
          aria-label="Rotate current page 90°"
          onClick={() => rotatePage(currentPage)}
          disabled={!hasPages}
        >
          <RotateIcon />
        </button>
        <button
          type="button"
          className="tool-btn"
          title={deleteTitle}
          aria-label={deleteLabel}
          onClick={onDeleteClick}
          disabled={deleteDisabled}
        >
          <TrashIcon />
        </button>
      </div>

      <div className="tool-group">
        <span className="label">Zoom</span>
        <button
          type="button"
          className="tool-btn"
          onClick={zoomOut}
          disabled={!hasPages}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <ZoomMenu />
        <button
          type="button"
          className="tool-btn"
          onClick={zoomIn}
          disabled={!hasPages}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="tool-group" style={{ marginLeft: 'auto', borderRight: 'none' }}>
        <button
          type="button"
          className="tool-btn"
          onClick={prevPage}
          disabled={!hasPages}
          aria-label="Previous page"
          title="Previous page"
        >
          ◀
        </button>
        <span
          className="page-indicator"
          aria-live="polite"
          aria-atomic="true"
          aria-label={
            hasPages ? `Page ${currentPage + 1} of ${pagesLength}` : 'No document loaded'
          }
        >
          {editingPage && hasPages ? (
            <input
              ref={pageInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="page-indicator-input"
              value={pageDraft}
              aria-label="Go to page"
              onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ''))}
              onKeyDown={onPageInputKeyDown}
              onBlur={commitPage}
            />
          ) : (
            <button
              type="button"
              className="page-indicator-current"
              onClick={startEditPage}
              disabled={!hasPages}
              aria-label={
                hasPages
                  ? `Current page ${currentPage + 1} of ${pagesLength}. Click to go to page.`
                  : 'No document loaded'
              }
            >
              {hasPages ? currentPage + 1 : '—'}
            </button>
          )}
          {' / '}
          <span>{hasPages ? pagesLength : '—'}</span>
        </span>
        <button
          type="button"
          className="tool-btn"
          onClick={nextPage}
          disabled={!hasPages}
          aria-label="Next page"
          title="Next page"
        >
          ▶
        </button>
        <button
          type="button"
          className={`tool-btn ${marginNotesOpen ? 'active' : ''}`}
          onClick={toggleMarginNotes}
          aria-label="Toggle notes panel"
          aria-pressed={marginNotesOpen}
          title="Toggle notes panel (Ctrl+Shift+N)"
        >
          <NotesIcon />
        </button>
      </div>
    </div>
  );
}
