import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import { filterCommands, useCommands, type Command } from '../hooks/useCommandPalette';

export interface CommandPaletteProps {
  onOpen: () => void | Promise<void>;
  onMerge: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
}

const LISTBOX_ID = 'command-palette-listbox';

export function CommandPalette(props: CommandPaletteProps): JSX.Element | null {
  const open = usePdfStore((s) => s.commandPaletteOpen);
  const setOpen = usePdfStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const commands = useCommands(props);
  const filtered = useMemo<Command[]>(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${activeIndex}"]`
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const close = (): void => setOpen(false);

  const runCommand = (cmd: Command): void => {
    close();
    void cmd.run();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) runCommand(cmd);
    }
  };

  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const activeId = filtered[activeIndex] ? `command-palette-option-${activeIndex}` : undefined;

  return (
    <div className="command-palette-backdrop" aria-hidden="true" onClick={close}>
      <div
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          placeholder="What do you want to do?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={true}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeId}
        />
        <div
          className="command-palette-list"
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
        >
          {filtered.length === 0 && (
            <div className="command-palette-empty">No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              type="button"
              key={cmd.id}
              id={`command-palette-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              data-cmd-index={i}
              className={`command-palette-row ${i === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => runCommand(cmd)}
            >
              <span className="command-palette-group">{cmd.group}</span>
              <span className="command-palette-label">{cmd.label}</span>
              {cmd.hint && <span className="command-palette-hint">{cmd.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
