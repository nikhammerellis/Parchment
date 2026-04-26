import { KeyboardEvent, MouseEvent, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import { Thumbnail } from './Thumbnail';
import { Outline } from './Outline';

type Tab = 'pages' | 'outline';

export function Sidebar(): JSX.Element {
  const pagesLength = usePdfStore((s) => s.pages.length);
  const outlineLength = usePdfStore((s) => s.outline.length);
  const clearPageSelection = usePdfStore((s) => s.clearPageSelection);
  const [tab, setTab] = useState<Tab>('pages');

  const showOutlineTab = outlineLength > 0;

  const tabs: Tab[] = showOutlineTab ? ['pages', 'outline'] : ['pages'];

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const currentIndex = tabs.indexOf(tab);
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setTab(nextTab);
    requestAnimationFrame(() => {
      document.getElementById(`sidebar-tab-${nextTab}`)?.focus();
    });
  };

  return (
    <aside id="sidebar">
      <div
        className="sidebar-tabs"
        role="tablist"
        aria-label="Sidebar panels"
        onKeyDown={onTabKeyDown}
      >
        <button
          type="button"
          id="sidebar-tab-pages"
          role="tab"
          aria-selected={tab === 'pages'}
          aria-controls="sidebar-panel-pages"
          tabIndex={tab === 'pages' ? 0 : -1}
          className={`sidebar-tab ${tab === 'pages' ? 'active' : ''}`}
          onClick={() => setTab('pages')}
        >
          Pages
          {pagesLength > 0 && <span className="sidebar-tab-count">{pagesLength}</span>}
        </button>
        {showOutlineTab && (
          <button
            type="button"
            id="sidebar-tab-outline"
            role="tab"
            aria-selected={tab === 'outline'}
            aria-controls="sidebar-panel-outline"
            tabIndex={tab === 'outline' ? 0 : -1}
            className={`sidebar-tab ${tab === 'outline' ? 'active' : ''}`}
            onClick={() => setTab('outline')}
          >
            Outline
          </button>
        )}
      </div>
      <div className="sidebar-body">
        <div
          id="sidebar-panel-pages"
          role="tabpanel"
          aria-labelledby="sidebar-tab-pages"
          hidden={tab !== 'pages'}
          onClick={(e: MouseEvent<HTMLDivElement>) => {
            // Click on empty sidebar area (i.e. not on a thumbnail) clears
            // the selection. Thumbnail.onClick stops propagation so this
            // only fires for true background clicks.
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('thumb-list')) {
              clearPageSelection();
            }
          }}
        >
          <div
            className="thumb-list"
            role="listbox"
            aria-multiselectable="true"
            aria-label="Page thumbnails"
          >
            {Array.from({ length: pagesLength }, (_, i) => (
              <Thumbnail key={i} index={i} />
            ))}
          </div>
        </div>
        {showOutlineTab && (
          <div
            id="sidebar-panel-outline"
            role="tabpanel"
            aria-labelledby="sidebar-tab-outline"
            hidden={tab !== 'outline'}
          >
            <Outline />
          </div>
        )}
      </div>
    </aside>
  );
}
