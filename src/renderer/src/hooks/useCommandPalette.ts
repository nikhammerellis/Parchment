import { useEffect, useMemo, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import type { OutlineNode, RecentFile, Tool, ZoomMode } from '../types';

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void | Promise<void>;
}

export interface CommandPaletteParams {
  onOpen: () => void | Promise<void>;
  onMerge: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
}

function flattenOutline(nodes: OutlineNode[], depth: number, out: Array<{ node: OutlineNode; depth: number }>): void {
  for (const n of nodes) {
    out.push({ node: n, depth });
    flattenOutline(n.children, depth + 1, out);
  }
}

export function useCommands(params: CommandPaletteParams): Command[] {
  const { onOpen, onMerge, onSave, onOpenPath } = params;
  const pages = usePdfStore((s) => s.pages);
  const pagesLength = pages.length;
  const outline = usePdfStore((s) => s.outline);
  const selectedAnnotation = usePdfStore((s) => s.selectedAnnotation);
  const selectionSize = usePdfStore((s) => s.selectedPages.size);
  const activeSourceKey = usePdfStore((s) =>
    s.pages[s.currentPage] ? s.pages[s.currentPage].sourceKey : null
  );

  const commandPaletteOpen = usePdfStore((s) => s.commandPaletteOpen);
  const [recents, setRecents] = useState<RecentFile[]>([]);
  useEffect(() => {
    // Re-fetch recents on mount and whenever the palette opens so the Recent
    // group reflects the current main-process list.
    let cancelled = false;
    void window.api
      .getRecents()
      .then((list) => {
        if (!cancelled) setRecents(list);
      })
      .catch(() => setRecents([]));
    return (): void => {
      cancelled = true;
    };
  }, [commandPaletteOpen]);

  return useMemo<Command[]>(() => {
    const store = usePdfStore.getState;
    const setTool = (tool: Tool) => (): void => store().setTool(tool);
    const setZoomMode = (mode: ZoomMode) => (): void => store().setZoomMode(mode);

    const commands: Command[] = [
      {
        id: 'file.open',
        label: 'Open PDF…',
        group: 'File',
        run: () => onOpen()
      },
      {
        id: 'file.merge',
        label: 'Merge PDF…',
        group: 'File',
        run: () => onMerge()
      },
      {
        id: 'file.save',
        label: 'Save PDF…',
        group: 'File',
        run: () => onSave()
      },
      {
        id: 'file.export-annotations',
        label: 'Export Annotations…',
        group: 'File',
        hint: 'Ctrl+Shift+E',
        run: () => store().exportAnnotations()
      },
      {
        id: 'view.toggle-notes',
        label: 'Toggle notes panel',
        group: 'View',
        hint: 'Ctrl+Shift+N',
        run: () => store().toggleMarginNotes()
      },
      {
        id: 'view.toggle-focus-mode',
        label: 'Toggle focus mode',
        group: 'View',
        hint: 'F',
        run: () => store().toggleFocusMode()
      }
    ];

    if (pagesLength > 0) {
      commands.push(
        {
          id: 'tool.select',
          label: 'Select tool',
          group: 'Tools',
          hint: 'V',
          run: setTool('select')
        },
        {
          id: 'tool.highlight',
          label: 'Highlight tool',
          group: 'Tools',
          hint: 'H',
          run: setTool('highlight')
        },
        {
          id: 'tool.draw',
          label: 'Freehand tool',
          group: 'Tools',
          hint: 'D',
          run: setTool('draw')
        },
        {
          id: 'tool.erase',
          label: 'Erase all on page',
          group: 'Tools',
          hint: 'E',
          run: () => store().clearAnnotations(store().currentPage)
        },
        {
          id: 'page.rotate',
          label: 'Rotate page 90°',
          group: 'Page',
          hint: 'R',
          run: () => store().rotatePage(store().currentPage)
        },
        {
          id: 'page.delete',
          label: 'Delete page',
          group: 'Page',
          run: () => store().deletePage(store().currentPage)
        },
        {
          id: 'page.next',
          label: 'Next page',
          group: 'Page',
          run: () => store().nextPage()
        },
        {
          id: 'page.prev',
          label: 'Previous page',
          group: 'Page',
          run: () => store().prevPage()
        },
        {
          id: 'zoom.fit-width',
          label: 'Fit Width',
          group: 'Zoom',
          run: setZoomMode('fit-width')
        },
        {
          id: 'zoom.fit-page',
          label: 'Fit Page',
          group: 'Zoom',
          hint: 'Ctrl+0',
          run: setZoomMode('fit-page')
        },
        {
          id: 'zoom.actual',
          label: 'Actual Size (100%)',
          group: 'Zoom',
          hint: 'Ctrl+1',
          run: setZoomMode('actual')
        },
        {
          id: 'zoom.in',
          label: 'Zoom in',
          group: 'Zoom',
          run: () => store().zoomIn()
        },
        {
          id: 'zoom.out',
          label: 'Zoom out',
          group: 'Zoom',
          run: () => store().zoomOut()
        },
        {
          id: 'edit.undo',
          label: 'Undo',
          group: 'Edit',
          hint: 'Ctrl+Z',
          run: () => store().undo()
        },
        {
          id: 'edit.redo',
          label: 'Redo',
          group: 'Edit',
          hint: 'Ctrl+Shift+Z',
          run: () => store().redo()
        }
      );

      if (selectedAnnotation) {
        commands.push({
          id: 'edit.delete-annotation',
          label: 'Delete selected annotation',
          group: 'Edit',
          hint: 'Delete',
          run: () => store().deleteSelectedAnnotation()
        });
      }

      if (selectionSize > 0) {
        commands.push(
          {
            id: 'page.delete-selected',
            label: `Delete selected pages (${selectionSize})`,
            group: 'Page',
            run: () => store().deleteSelectedPages()
          },
          {
            id: 'page.rotate-selected',
            label: `Rotate selected pages (${selectionSize})`,
            group: 'Page',
            run: () => store().rotateSelectedPages()
          },
          {
            id: 'page.clear-selection',
            label: 'Clear page selection',
            group: 'Page',
            run: () => store().clearPageSelection()
          }
        );
      }
    }

    for (const recent of recents) {
      commands.push({
        id: `recent:${recent.path}`,
        label: recent.name,
        group: 'Recent',
        hint: recent.path,
        run: () => onOpenPath(recent.path)
      });
    }

    if (pagesLength > 0 && outline.length > 0) {
      const flat: Array<{ node: OutlineNode; depth: number }> = [];
      flattenOutline(outline, 0, flat);
      for (const entry of flat) {
        if (entry.node.pageIndex === null) continue;
        const srcIndex = entry.node.pageIndex;
        const label = `${'  '.repeat(entry.depth)}${entry.node.title}`;
        commands.push({
          id: `outline:${entry.node.title}:${srcIndex}`,
          label,
          group: 'Outline',
          run: (): void => {
            const s = store();
            const match = s.pages.findIndex(
              (p) => p.sourceKey === activeSourceKey && p.srcIndex === srcIndex
            );
            if (match >= 0) s.goToPage(match);
          }
        });
      }
    }

    return commands;
  }, [onOpen, onMerge, onSave, onOpenPath, pagesLength, outline, selectedAnnotation, selectionSize, recents, activeSourceKey]);
}

interface Scored {
  command: Command;
  score: number;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (q === '') return commands;

  const goToPageMatch = q.match(/^\s*(?:go|goto|page)\s*(\d+)\s*$/);
  const numericOnly = q.match(/^\s*(\d+)\s*$/);
  const target = goToPageMatch?.[1] ?? numericOnly?.[1];
  const scored: Scored[] = [];

  for (const cmd of commands) {
    const s = score(cmd.label.toLowerCase(), q);
    if (s > 0) scored.push({ command: cmd, score: s + groupBoost(cmd.group) });
  }

  if (target) {
    const n = Number.parseInt(target, 10);
    scored.unshift({
      command: {
        id: `page.goto.${n}`,
        label: `Go to page ${n}`,
        group: 'Page',
        run: (): void => usePdfStore.getState().goToPage(n - 1)
      },
      score: 1000
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.command).slice(0, 50);
}

function groupBoost(group: string): number {
  if (group === 'Tools') return 2;
  if (group === 'File') return 1;
  return 0;
}

function score(label: string, query: string): number {
  if (label.includes(query)) {
    // substring match: prefer earlier position
    const idx = label.indexOf(query);
    return 100 - idx + query.length;
  }
  // subsequence match
  let qi = 0;
  let s = 0;
  let streak = 0;
  for (let i = 0; i < label.length && qi < query.length; i++) {
    if (label[i] === query[qi]) {
      s += 2 + streak;
      streak += 1;
      qi += 1;
    } else {
      streak = 0;
    }
  }
  if (qi < query.length) return 0;
  return s;
}
