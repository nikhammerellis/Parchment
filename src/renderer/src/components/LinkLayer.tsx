import { useEffect, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { usePdfStore } from '../state/pdfStore';
import { pageNativeBboxToDisplayRect, type PageNativeSize } from '../lib/rotation';

interface LinkEntry {
  rect: { x: number; y: number; w: number; h: number };
  kind: 'internal' | 'external';
  dest?: unknown;
  destName?: string;
  url?: string;
  resolvedPageIndex?: number;
}

export interface LinkLayerProps {
  page: PDFPageProxy;
  pageSize: PageNativeSize;
  rotation: number;
  displayScale: number;
  canvasWidth: number;
  canvasHeight: number;
  // Continuous-scroll: each page owns its own LinkLayer, so destinations must
  // resolve against the link-owning page's source, not the focal page's.
  sourceDoc: PDFDocumentProxy;
  sourceKey: string;
}

interface PdfJsLinkAnnotation {
  subtype: string;
  rect: [number, number, number, number];
  url?: string;
  unsafeUrl?: string;
  dest?: unknown;
}

export function LinkLayer(props: LinkLayerProps): JSX.Element {
  const {
    page,
    pageSize,
    rotation,
    displayScale,
    canvasWidth,
    canvasHeight,
    sourceDoc,
    sourceKey
  } = props;
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const pages = usePdfStore((s) => s.pages);
  const goToPage = usePdfStore((s) => s.goToPage);
  const showToast = usePdfStore((s) => s.showToast);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const raw = (await page.getAnnotations()) as PdfJsLinkAnnotation[];
        if (cancelled) return;
        const entries: LinkEntry[] = [];
        for (const ann of raw) {
          if (ann.subtype !== 'Link') continue;
          if (!ann.rect || ann.rect.length !== 4) continue;
          const [x1, y1, x2, y2] = ann.rect;
          // pdf.js annotation rects are in PDF points with bottom-left origin.
          // Convert to our page-native top-left y-down space.
          const pageH = pageSize.height;
          const nx = Math.min(x1, x2);
          const nw = Math.abs(x2 - x1);
          const nh = Math.abs(y2 - y1);
          const ny = pageH - Math.max(y1, y2);
          if (ann.url || ann.unsafeUrl) {
            entries.push({
              rect: { x: nx, y: ny, w: nw, h: nh },
              kind: 'external',
              url: ann.url || ann.unsafeUrl
            });
          } else if (ann.dest) {
            entries.push({
              rect: { x: nx, y: ny, w: nw, h: nh },
              kind: 'internal',
              dest: ann.dest
            });
          }
        }

        // Best-effort resolve internal-link destinations so the aria-label can
        // name the concrete target page. Failures are silent — we fall back to
        // a generic label.
        const activePages = usePdfStore.getState().pages;
        for (const entry of entries) {
          if (entry.kind !== 'internal' || !entry.dest) continue;
          try {
            let resolved: unknown[] | null = null;
            if (typeof entry.dest === 'string') {
              resolved = (await sourceDoc.getDestination(
                entry.dest
              )) as unknown[] | null;
            } else if (Array.isArray(entry.dest)) {
              resolved = entry.dest as unknown[];
            }
            if (cancelled) return;
            if (!resolved || resolved.length === 0) continue;
            const ref = resolved[0];
            const srcIndex = await sourceDoc.getPageIndex(ref as never);
            if (cancelled) return;
            if (typeof srcIndex !== 'number') continue;
            const match = activePages.findIndex(
              (p) => p.sourceKey === sourceKey && p.srcIndex === srcIndex
            );
            if (match >= 0) entry.resolvedPageIndex = match;
          } catch {
            // best-effort — leave resolvedPageIndex undefined
          }
        }

        if (cancelled) return;
        setLinks(entries);
      } catch {
        setLinks([]);
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [page, pageSize.height]);

  const onClick = async (link: LinkEntry): Promise<void> => {
    if (link.kind === 'external' && link.url) {
      try {
        const ok = await window.api.openExternal(link.url);
        if (!ok) showToast('Only http/https links open externally', true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Couldn't open: ${message}`, true);
      }
      return;
    }
    if (link.kind === 'internal') {
      try {
        let resolved: unknown[] | null = null;
        if (typeof link.dest === 'string') {
          resolved = (await sourceDoc.getDestination(link.dest)) as unknown[] | null;
        } else if (Array.isArray(link.dest)) {
          resolved = link.dest as unknown[];
        }
        if (!resolved || resolved.length === 0) return;
        const ref = resolved[0];
        const srcIndex = await sourceDoc.getPageIndex(ref as never);
        if (typeof srcIndex !== 'number') return;
        // Find the first page entry that references this source index in the
        // current (possibly reordered) document.
        const match = pages.findIndex(
          (p) => p.sourceKey === sourceKey && p.srcIndex === srcIndex
        );
        if (match >= 0) goToPage(match);
      } catch {
        // best-effort link resolution
      }
    }
  };

  if (canvasWidth === 0 || canvasHeight === 0) return <></>;

  return (
    <div
      className="link-layer"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      {links.map((link, i) => {
        const dr = pageNativeBboxToDisplayRect(
          link.rect,
          pageSize,
          rotation,
          displayScale
        );
        const ariaLabel =
          link.kind === 'external'
            ? `Open external link: ${link.url ?? ''}`
            : link.resolvedPageIndex !== undefined
              ? `Jump to page ${link.resolvedPageIndex + 1}`
              : 'Jump to linked page';
        return (
          <button
            key={i}
            type="button"
            className="link-hit"
            title={link.kind === 'external' ? link.url : 'Jump to page'}
            aria-label={ariaLabel}
            onClick={() => void onClick(link)}
            style={{
              left: dr.x,
              top: dr.y,
              width: Math.max(4, dr.w),
              height: Math.max(4, dr.h)
            }}
          />
        );
      })}
    </div>
  );
}
