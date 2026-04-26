import {
  KeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { usePdfStore } from '../state/pdfStore';
import { scrollToPage } from '../lib/scrollController';
import { getTextContent } from '../lib/textContentCache';
import { textUnderHighlight } from '../lib/highlightText';
import type { Annotation, DrawAnnotation, HighlightAnnotation, PageEntry } from '../types';
import { TrashIcon } from './icons';

/*
 * Right-rail panel listing every annotation in the document. Rows are grouped
 * by page (collapsible) and clicking a row scrolls the main view to that page
 * via the scrollController and selects the annotation. Notes can be edited
 * inline; commit happens on Enter (without Shift), blur, or Esc-cancel.
 */

interface PageGroup {
  pageIndex: number;
  page: PageEntry;
}

function groupPages(pages: PageEntry[]): PageGroup[] {
  const out: PageGroup[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].annotations.length > 0) {
      out.push({ pageIndex: i, page: pages[i] });
    }
  }
  return out;
}

function totalAnnotations(pages: PageEntry[]): number {
  let n = 0;
  for (const p of pages) n += p.annotations.length;
  return n;
}

interface DrawingPreviewProps {
  ann: DrawAnnotation;
  pageWidth: number;
  pageHeight: number;
}

const PREVIEW_WIDTH = 80;
const PREVIEW_HEIGHT = 50;

function DrawingPreview(props: DrawingPreviewProps): JSX.Element {
  const { ann, pageWidth, pageHeight } = props;
  const path = useMemo(() => {
    if (ann.points.length === 0 || pageWidth <= 0 || pageHeight <= 0) return '';
    const sx = PREVIEW_WIDTH / pageWidth;
    const sy = PREVIEW_HEIGHT / pageHeight;
    const scale = Math.min(sx, sy);
    // Center the path in the preview box.
    const offsetX = (PREVIEW_WIDTH - pageWidth * scale) / 2;
    const offsetY = (PREVIEW_HEIGHT - pageHeight * scale) / 2;
    let d = '';
    ann.points.forEach((pt, i) => {
      const x = pt[0] * scale + offsetX;
      const y = pt[1] * scale + offsetY;
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });
    return d;
  }, [ann.points, pageWidth, pageHeight]);
  return (
    <svg
      className="margin-notes-drawing-preview"
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
      aria-hidden="true"
    >
      <path d={path} stroke={ann.color} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface NoteEditorProps {
  initialNote: string;
  onCommit: (note: string) => void;
}

function NoteEditor(props: NoteEditorProps): JSX.Element {
  const { initialNote, onCommit } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(initialNote);
  }, [initialNote]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        taRef.current?.focus();
        taRef.current?.select();
      });
    }
  }, [editing]);

  const commit = (): void => {
    if (draft !== initialNote) onCommit(draft);
    setEditing(false);
  };

  const cancel = (): void => {
    setDraft(initialNote);
    setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const startEdit = (e: MouseEvent<HTMLElement>): void => {
    e.stopPropagation();
    setEditing(true);
  };

  if (!editing) {
    if (initialNote.length === 0) {
      return (
        <button
          type="button"
          className="margin-notes-note-add"
          onClick={startEdit}
          aria-label="Add note"
        >
          Add note…
        </button>
      );
    }
    return (
      <button
        type="button"
        className="margin-notes-note-display"
        onClick={startEdit}
        aria-label="Edit note"
      >
        {initialNote}
      </button>
    );
  }

  return (
    <textarea
      ref={taRef}
      className="margin-notes-note-editor"
      value={draft}
      placeholder="Note…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      rows={2}
    />
  );
}

interface AnnotationRowProps {
  pageIndex: number;
  ann: Annotation;
  highlightText: string;
  pageWidth: number;
  pageHeight: number;
}

function AnnotationRow(props: AnnotationRowProps): JSX.Element {
  const { pageIndex, ann, highlightText, pageWidth, pageHeight } = props;
  const selectAnnotationById = usePdfStore((s) => s.selectAnnotationById);
  const deleteAnnotationById = usePdfStore((s) => s.deleteAnnotationById);
  const updateAnnotationNote = usePdfStore((s) => s.updateAnnotationNote);
  const selectedAnnotation = usePdfStore((s) => s.selectedAnnotation);

  const annotationsAtPage = usePdfStore((s) => s.pages[pageIndex]?.annotations);
  const myIndex = annotationsAtPage?.findIndex((a) => a.id === ann.id) ?? -1;
  const isSelected =
    !!selectedAnnotation &&
    selectedAnnotation.pageIndex === pageIndex &&
    selectedAnnotation.index === myIndex;

  const onActivate = (): void => {
    selectAnnotationById(pageIndex, ann.id);
    scrollToPage(pageIndex, 'center');
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
      e.preventDefault();
      onActivate();
    }
  };

  const onDelete = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    deleteAnnotationById(pageIndex, ann.id);
  };

  const typeLabel = ann.type === 'highlight' ? 'Highlight' : 'Drawing';

  return (
    <div
      className={`margin-notes-row ${isSelected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={onRowKeyDown}
      aria-label={`${typeLabel} on page ${pageIndex + 1}`}
    >
      <div className="margin-notes-row-header">
        <span
          className="margin-notes-swatch"
          style={{ background: ann.color }}
          aria-hidden="true"
        />
        <span className="margin-notes-type">{typeLabel}</span>
        <span className="margin-notes-page">p. {pageIndex + 1}</span>
        <button
          type="button"
          className="margin-notes-delete"
          onClick={onDelete}
          title="Delete annotation"
          aria-label={`Delete ${typeLabel.toLowerCase()} on page ${pageIndex + 1}`}
        >
          <TrashIcon />
        </button>
      </div>
      {ann.type === 'highlight' && highlightText.length > 0 && (
        <blockquote className="margin-notes-quote">{highlightText}</blockquote>
      )}
      {ann.type === 'highlight' && highlightText.length === 0 && (
        <blockquote className="margin-notes-quote muted">(non-text region)</blockquote>
      )}
      {ann.type === 'draw' && (
        <DrawingPreview ann={ann as DrawAnnotation} pageWidth={pageWidth} pageHeight={pageHeight} />
      )}
      <NoteEditor
        initialNote={ann.note ?? ''}
        onCommit={(note) => updateAnnotationNote(pageIndex, ann.id, note)}
      />
    </div>
  );
}

interface PageGroupSectionProps {
  group: PageGroup;
  collapsed: boolean;
  onToggle: () => void;
  highlightTextFor: (pageIndex: number, ann: HighlightAnnotation) => string;
}

function PageGroupSection(props: PageGroupSectionProps): JSX.Element {
  const { group, collapsed, onToggle, highlightTextFor } = props;
  const { pageIndex, page } = group;
  const count = page.annotations.length;
  return (
    <section className="margin-notes-group">
      <button
        type="button"
        className={`margin-notes-group-header ${collapsed ? 'collapsed' : ''}`}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="margin-notes-group-title">Page {pageIndex + 1}</span>
        <span className="margin-notes-group-count">
          {count} annotation{count === 1 ? '' : 's'}
        </span>
      </button>
      {!collapsed && (
        <div className="margin-notes-group-rows">
          {page.annotations.map((ann) => (
            <AnnotationRow
              key={ann.id}
              pageIndex={pageIndex}
              ann={ann}
              highlightText={
                ann.type === 'highlight'
                  ? highlightTextFor(pageIndex, ann as HighlightAnnotation)
                  : ''
              }
              pageWidth={page.nativeSize.width}
              pageHeight={page.nativeSize.height}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function MarginNotes(): JSX.Element | null {
  const open = usePdfStore((s) => s.marginNotesOpen);
  const pages = usePdfStore((s) => s.pages);
  const sources = usePdfStore((s) => s.sources);
  const setMarginNotesOpen = usePdfStore((s) => s.setMarginNotesOpen);

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [highlightTexts, setHighlightTexts] = useState<Map<string, string>>(
    () => new Map()
  );

  const groups = useMemo(() => groupPages(pages), [pages]);
  const total = useMemo(() => totalAnnotations(pages), [pages]);

  // Async-fetch highlight previews. Keyed by `${pageIndex}:${ann.id}` so that
  // moving an annotation to a different page or editing its bbox invalidates.
  // We re-derive the preview-key set on each annotation change and only fetch
  // for new keys.
  const previewKeys = useMemo(() => {
    const items: Array<{
      key: string;
      pageIndex: number;
      pageHeight: number;
      sourceKey: string;
      srcIndex: number;
      ann: HighlightAnnotation;
    }> = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      for (const ann of page.annotations) {
        if (ann.type !== 'highlight') continue;
        const key = `${i}:${ann.id}:${ann.x}:${ann.y}:${ann.w}:${ann.h}`;
        items.push({
          key,
          pageIndex: i,
          pageHeight: page.nativeSize.height,
          sourceKey: page.sourceKey,
          srcIndex: page.srcIndex,
          ann: ann as HighlightAnnotation
        });
      }
    }
    return items;
  }, [pages]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async (): Promise<void> => {
      const next = new Map<string, string>();
      for (const item of previewKeys) {
        const existing = highlightTexts.get(item.key);
        if (existing !== undefined) {
          next.set(item.key, existing);
          continue;
        }
        const source = sources[item.sourceKey];
        if (!source) {
          next.set(item.key, '');
          continue;
        }
        try {
          const pdfPage = await source.pdfjsDoc.getPage(item.srcIndex + 1);
          const tc = await getTextContent(pdfPage, item.sourceKey, item.srcIndex);
          if (cancelled) return;
          const text = textUnderHighlight(
            { x: item.ann.x, y: item.ann.y, w: item.ann.w, h: item.ann.h },
            tc,
            item.pageHeight
          );
          next.set(item.key, text);
        } catch {
          next.set(item.key, '');
        }
      }
      if (cancelled) return;
      // Only update if something actually changed (cheap-ish equality).
      let changed = next.size !== highlightTexts.size;
      if (!changed) {
        for (const [k, v] of next) {
          if (highlightTexts.get(k) !== v) {
            changed = true;
            break;
          }
        }
      }
      if (changed) setHighlightTexts(next);
    })();
    return (): void => {
      cancelled = true;
    };
    // highlightTexts intentionally omitted — using it as a cache, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewKeys, sources]);

  const highlightTextFor = useCallback(
    (pageIndex: number, ann: HighlightAnnotation): string => {
      const key = `${pageIndex}:${ann.id}:${ann.x}:${ann.y}:${ann.w}:${ann.h}`;
      return highlightTexts.get(key) ?? '';
    },
    [highlightTexts]
  );

  const toggleGroup = (pageIndex: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  };

  if (!open) return null;

  return (
    <aside id="margin-notes" aria-label="Annotations panel">
      <div className="margin-notes-header">
        <h2 className="margin-notes-title">Notes</h2>
        <span className="margin-notes-total">{total}</span>
        <button
          type="button"
          className="margin-notes-close"
          onClick={() => setMarginNotesOpen(false)}
          aria-label="Close notes panel"
          title="Close notes panel"
        >
          ×
        </button>
      </div>
      <div className="margin-notes-body">
        {total === 0 ? (
          <div className="margin-notes-empty">
            No annotations yet. Use H to highlight or D to draw.
          </div>
        ) : (
          groups.map((group) => (
            <PageGroupSection
              key={group.pageIndex}
              group={group}
              collapsed={collapsed.has(group.pageIndex)}
              onToggle={() => toggleGroup(group.pageIndex)}
              highlightTextFor={highlightTextFor}
            />
          ))
        )}
      </div>
    </aside>
  );
}
