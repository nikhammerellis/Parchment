import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import type { OutlineNode } from '../types';

interface FlatNode {
  node: OutlineNode;
  level: number;
  // Path of indices down from the root — used as a stable id for expand tracking.
  path: string;
  // Index of the parent in the flat list (−1 for roots). Used by ArrowLeft to
  // move focus up the tree.
  parentIndex: number;
  hasChildren: boolean;
}

function flatten(
  nodes: OutlineNode[],
  level: number,
  parentPath: string,
  parentIndex: number,
  expanded: Set<string>,
  out: FlatNode[]
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const path = parentPath === '' ? String(i) : `${parentPath}/${i}`;
    const hasChildren = node.children.length > 0;
    const myIndex = out.length;
    out.push({ node, level, path, parentIndex, hasChildren });
    if (hasChildren && expanded.has(path)) {
      flatten(node.children, level + 1, path, myIndex, expanded, out);
    }
  }
}

export function Outline(): JSX.Element {
  const outline = usePdfStore((s) => s.outline);
  const pages = usePdfStore((s) => s.pages);
  const activeSourceKey = usePdfStore((s) =>
    s.pages[s.currentPage] ? s.pages[s.currentPage].sourceKey : null
  );
  const goToPage = usePdfStore((s) => s.goToPage);

  // Default: top-level nodes expanded (matches the prior `level < 1` behavior).
  const defaultExpanded = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (let i = 0; i < outline.length; i++) {
      if (outline[i].children.length > 0) set.add(String(i));
    }
    return set;
  }, [outline]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);
  // Reset expand-state if the outline itself changes (new document loaded).
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const flat = useMemo<FlatNode[]>(() => {
    const out: FlatNode[] = [];
    flatten(outline, 0, '', -1, expanded, out);
    return out;
  }, [outline, expanded]);

  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pendingFocusRef = useRef<boolean>(false);

  // Clamp focused index when the flat list shrinks (e.g. parent collapsed).
  useEffect(() => {
    if (focusedIndex >= flat.length && flat.length > 0) {
      setFocusedIndex(flat.length - 1);
    }
  }, [flat.length, focusedIndex]);

  // When the user initiated a focus change via keyboard, move DOM focus to the
  // new roving-tabindex item. We don't do this on mount — the sidebar tabs
  // should still be the default focus target — only after an explicit key
  // press.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  const jump = useCallback(
    (node: OutlineNode): void => {
      if (node.pageIndex === null) return;
      const match = pages.findIndex(
        (p) => p.sourceKey === activeSourceKey && p.srcIndex === node.pageIndex
      );
      if (match >= 0) goToPage(match);
    },
    [pages, activeSourceKey, goToPage]
  );

  const toggle = useCallback((path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (flat.length === 0) return;
    const current = flat[focusedIndex];
    if (!current) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (focusedIndex < flat.length - 1) {
          pendingFocusRef.current = true;
          setFocusedIndex(focusedIndex + 1);
        }
        return;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (focusedIndex > 0) {
          pendingFocusRef.current = true;
          setFocusedIndex(focusedIndex - 1);
        }
        return;
      }
      case 'Home': {
        e.preventDefault();
        pendingFocusRef.current = true;
        setFocusedIndex(0);
        return;
      }
      case 'End': {
        e.preventDefault();
        pendingFocusRef.current = true;
        setFocusedIndex(flat.length - 1);
        return;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (current.hasChildren) {
          if (!expanded.has(current.path)) {
            toggle(current.path);
          } else if (focusedIndex + 1 < flat.length) {
            // Expanded: move to first child, which is the next item in the
            // flat list when it's our direct descendant.
            const next = flat[focusedIndex + 1];
            if (next && next.level > current.level) {
              pendingFocusRef.current = true;
              setFocusedIndex(focusedIndex + 1);
            }
          }
        }
        return;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (current.hasChildren && expanded.has(current.path)) {
          toggle(current.path);
        } else if (current.parentIndex >= 0) {
          pendingFocusRef.current = true;
          setFocusedIndex(current.parentIndex);
        }
        return;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        jump(current.node);
        return;
      }
      default:
        return;
    }
  };

  if (outline.length === 0) {
    return <div className="outline-empty">No outline in this document.</div>;
  }

  // Trim the refs array to current list length.
  itemRefs.current.length = flat.length;

  return (
    <div
      className="outline"
      role="tree"
      aria-label="Document outline"
      onKeyDown={handleKeyDown}
    >
      {flat.map((entry, i) => {
        const { node, level, path, hasChildren } = entry;
        const isOpen = expanded.has(path);
        const isFocused = i === focusedIndex;
        return (
          <div
            key={path}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role="treeitem"
            aria-level={level + 1}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-selected={false}
            tabIndex={isFocused ? 0 : -1}
            className="outline-row outline-treeitem"
            style={{ paddingLeft: 8 + level * 12 }}
            onClick={() => {
              setFocusedIndex(i);
              jump(node);
            }}
          >
            {hasChildren ? (
              <span
                className={`outline-chevron ${isOpen ? 'open' : ''}`}
                aria-hidden="true"
              >
                ›
              </span>
            ) : (
              <span className="outline-chevron-placeholder" aria-hidden="true" />
            )}
            <span
              className={`outline-title ${node.pageIndex === null ? 'disabled' : ''}`}
              title={node.title}
            >
              {node.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
