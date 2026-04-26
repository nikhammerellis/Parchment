import { usePdfStore } from '../state/pdfStore';

export interface TopBarProps {
  onOpen: () => void | Promise<void>;
  onMerge: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
}

export function TopBar(props: TopBarProps): JSX.Element {
  const { onOpen, onMerge, onSave } = props;
  const fileName = usePdfStore((s) => s.fileName);
  const hasPages = usePdfStore((s) => s.pages.length > 0);
  const dirty = usePdfStore((s) => s.dirty);

  return (
    <div id="topbar">
      <div className="brand">
        <div className="logo">
          Parchment<em>.</em>
        </div>
        <div className="tag">PDF Reader · Editor</div>
      </div>
      {fileName && (
        <div
          className="file-name"
          title={dirty ? 'Unsaved changes' : 'Saved'}
          aria-label={`${fileName} — ${dirty ? 'unsaved changes' : 'saved'}`}
        >
          <span className={`dot ${dirty ? 'dirty' : ''}`} aria-hidden="true">●</span>
          {fileName}
        </div>
      )}
      <div className="topbar-actions">
        <button type="button" className="btn ghost" onClick={() => void onOpen()}>
          Open
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void onMerge()}
          disabled={!hasPages}
        >
          Merge PDF
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void onSave()}
          disabled={!hasPages}
        >
          Save PDF
        </button>
      </div>
    </div>
  );
}
