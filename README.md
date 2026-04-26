# Parchment

A local PDF reader and editor. Open, annotate, rearrange, merge, and save PDFs — everything runs on-device.

Built with Electron, React 18, TypeScript, Zustand, pdf.js, and pdf-lib.

## What it does

- Open PDFs via native file dialogs, drag-and-drop, or the recent-files list
- View the whole document in a continuous vertical scroll — pages virtualize in and out of the viewport so 1000-page docs stay snappy
- Zoom (presets, zoom-to-cursor, pinch), smooth keyboard navigation, and a live thumbnail sidebar
- Select text and copy to clipboard; find-in-document with match navigation
- Annotate with highlight rectangles (snap-to-text) and freehand pen in 6 colors
- Select annotations and delete them; erase all annotations on a page
- Browse every annotation across the doc in a right-rail Notes panel — grouped by page, with text previews for highlights, mini-canvas previews for drawings, click-to-jump, inline note editing, and per-row delete
- Export every annotation (text, color, page, optional notes) as a `.md` sidecar
- Reading focus mode (`F`) — chrome dims away after 600ms of idle so the page is all that's left, with a subtle warm tint near the top
- Undo/redo every mutating action
- Rotate / delete / reorder pages (thumbnail hover actions or drag-and-drop)
- Multi-select thumbnails (Shift-click for ranges, Ctrl/Cmd-click to toggle) and bulk delete / rotate / drag-reorder N pages in one undo step
- Merge pages from a second PDF onto the end of the current document
- Follow clickable internal and external links; jump via an Outline panel if the PDF has one
- Command palette (`Ctrl/Cmd-K`) for every action, recent file, and outline entry
- Unsaved-changes indicator in the title bar plus a close-guard dialog
- Save a baked PDF through a native save dialog — rotation, reordering, deletions, merged pages, and annotations are all written into the output via pdf-lib. Freehand strokes are rendered as smoothed Catmull-Rom beziers.

## Dev workflow

```sh
npm install
npm run dev
```

`npm run dev` launches electron-vite in watch mode with HMR for the renderer.

## Build

```sh
npm run build
```

Produces bundled main / preload / renderer output under `out/`. TypeScript is checked as part of the build.

## Package for distribution

```sh
npm run build:win
npm run build:mac
npm run build:linux
```

Uses `electron-builder`. Installers land under `dist/`.

- Windows: NSIS installer, x64
- macOS: DMG, x64 + arm64
- Linux: AppImage + deb

### Icon assets

The `build/` directory holds icon source assets that electron-builder reads at
package time. v0.1.0 ships a placeholder `build/icon.png` (1024 × 1024) — a
flat panel-dark square with an accent-orange disc that nods at the wordmark's
trailing accent period. electron-builder derives the platform-specific ICO,
ICNS, and AppImage icons from the PNG automatically.

To regenerate the placeholder (e.g. after tweaking the brand colors):

```sh
npm run icons
```

The generator lives at `scripts/generate-placeholder-icon.cjs` and only
depends on `pngjs` (no native build steps). A polished, mark-driven icon is
planned for a later release.

## Distribution

v0.1.0 ships unsigned binaries — convenient for self-distribution, but each
platform shows a security prompt the first time a user launches an unsigned
app:

- **macOS DMG** — Gatekeeper warns "cannot be opened because it is from an
  unidentified developer." Right-click the app and pick *Open* once to add a
  permanent exception, or notarize via an Apple Developer account.
- **Windows NSIS** — SmartScreen warns "Microsoft Defender SmartScreen
  prevented an unrecognized app from starting." Click *More info → Run anyway*,
  or sign with an EV code-signing certificate.
- **Linux AppImage / deb** — no signing prompts; the AppImage just needs the
  executable bit (`chmod +x`).

Wiring real signing into CI is out of scope for v0.1 — it requires
credentials we don't have yet.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` / `H` / `D` / `E` | Select / Highlight / Draw / Erase tool |
| `F` | Toggle reading focus mode |
| `R` | Rotate current page 90° |
| `←` / `→` | Previous / Next page (smooth-scroll) |
| `↑` / `↓` | Previous / Next page (smooth-scroll, when focus isn't in sidebar/tree) |
| `PageUp` / `PageDown` | Previous / Next page |
| `Delete` / `Backspace` | Delete selected annotation (Select mode), or selected pages (sidebar focus) |
| `Esc` | Deselect annotation, or clear page selection (sidebar focus) |
| `Shift`-click thumbnail | Extend page selection from anchor |
| `Ctrl/Cmd`-click thumbnail | Toggle thumbnail in/out of the page selection |
| `Ctrl/Cmd-S` | Save PDF |
| `Ctrl/Cmd-Z` / `Ctrl/Cmd-Shift-Z` | Undo / Redo |
| `Ctrl/Cmd-O` / `Ctrl/Cmd-Shift-O` | Open / Merge |
| `Ctrl/Cmd-0` | Fit page |
| `Ctrl/Cmd-1` | Actual size (100%) |
| `Ctrl/Cmd-+` / `Ctrl/Cmd--` | Zoom in / out |
| `Ctrl/Cmd + wheel` / trackpad pinch | Zoom to cursor |
| `Ctrl/Cmd-R` | Rotate current page |
| `Ctrl/Cmd-Backspace` | Delete current page |
| `Ctrl/Cmd-K` | Command palette |
| `Ctrl/Cmd-F` | Find in document (toggles) |
| `Ctrl/Cmd-G` / `Ctrl/Cmd-Shift-G` | Next / previous match |
| `Ctrl/Cmd-Shift-N` | Toggle notes panel |
| `Ctrl/Cmd-Shift-E` | Export annotations to markdown |

## Command palette

`Ctrl/Cmd-K` opens a modal search over every tool, page, zoom, edit, recent file, and outline entry. Typing a number (e.g. `42`) adds a "Go to page 42" command. Enter runs the top match, arrow keys navigate, Esc closes.

## Architecture

### Processes

- **Main** (`src/main`) — owns the filesystem, native dialogs, and user-preference storage. Exposes IPC handlers for open/save dialogs, reading paths, recent-files persistence (via `electron-store`), `shell.openExternal` (http/https only), and dirty-state tracking. Builds the application menu (including Open Recent) and sends menu commands to the renderer over `menu:command`.
- **Preload** (`src/preload`) — the only bridge. `contextBridge.exposeInMainWorld('api', …)` hands the renderer a typed surface: `openPdf`, `openPath`, `savePdf`, `getRecents`, `clearRecents`, `openExternal`, `setDirty`, `saveComplete`, `onMenuCommand`, `platform`. `contextIsolation: true`, `nodeIntegration: false`.
- **Renderer** (`src/renderer/src`) — React + Zustand. All PDF parsing / rendering / annotation / baking happens here. Bytes cross the IPC boundary as `Uint8Array`.

### State shape

```ts
sources: Record<string, { bytes: Uint8Array; pdfjsDoc: PDFDocumentProxy }>
pages: Array<{ sourceKey: string; srcIndex: number; rotation: number; annotations: Annotation[]; nativeSize: { width: number; height: number } }>
history: { past: HistorySnapshot[]; future: HistorySnapshot[] }  // bounded ring, 50
dirty: boolean
zoomMode: 'custom' | 'fit-width' | 'fit-page' | 'actual'
viewport: { width: number; height: number }
selectedAnnotation: { pageIndex, index } | null
outline: OutlineNode[]
commandPaletteOpen: boolean
marginNotesOpen: boolean
```

Annotations now carry `id: string` (UUID) and an optional `note?: string`.

Every page references its source by key + original index. That's what makes merge-then-reorder-then-rotate-then-save work without ever re-encoding a source in-memory — on save, the pipeline loads each source into pdf-lib, copies pages in the current order, and applies rotation + annotations on top.

### Annotation coordinate system

Annotations are stored in **page-native PDF points** (origin top-left at 0° rotation, y-down). `lib/rotation.ts` converts between page-native space and the rotated display-pixel space at render time and at hit-test time. At save time, the y-axis is flipped against the native page height to match pdf-lib's bottom-left origin. Rotating a page mutates `rotation` without touching annotations — they stay put.

### Save pipeline (`lib/pdfSave.ts`)

1. Load each `sources[key].bytes` into `pdf-lib` once, cached by key.
2. For each `pages[i]`, `out.copyPages(srcDoc, [srcIndex])` and apply `setRotation`.
3. Highlights: `drawRectangle` at `(x, pageHeight - (y + h))`, opacity 0.4.
4. Freehand: `pointsToSvgPath` produces a Catmull-Rom → cubic-bezier path; `drawSvgPath` is called with `x: 0, y: pageHeight` (its internal `scale(1, -1)` does the Y-flip for us), giving a single smooth stroke per annotation.
5. Return the bytes. The renderer hands them back to the main process, which writes via `fs.writeFile` after the user picks a path.

### History

`state/history.ts` holds `{ past, future }` arrays of snapshots (`pages`, `currentPage`, `fileName`, `filePath`, `selectedAnnotation`, source keys). `sources` is never snapshotted — the live pdf.js docs stay referenced by the store and are reattached on undo. Every mutating action calls `pushDirtySnapshot` before applying its change, and each snapshot is deep-cloned.

### Continuous scroll + virtualization

`PageView` is a single scroll container that renders one `PageStackItem` per page. Each item runs an `IntersectionObserver` against the scroll root with a ~800 px margin: when the page is near the viewport it mounts the full canvas stack (PDF / text / find-match / annotation / link layers); when it scrolls out of range, it tears all of that down and renders only a placeholder sized from `nativeSize × scale` (with a width/height swap on 90°/270°). Off-screen pages keep their slot in the layout, so scroll position is stable.

A second `IntersectionObserver` in `PageView` tracks every page's visible area (`intersectionRatio × boundingClientRect.height`) and feeds the page with the largest visible area back to the store as `currentPage` — the "focal page." Thumbnails, the page indicator, the toolbar's per-page actions (rotate / delete), and find navigation all read this same `currentPage`. Programmatic jumps go through `lib/scrollController.ts`, a tiny module-level channel that `PageView` populates on mount; consumers (`goToPage`, `next/prevPage`, `next/prevMatch`, post-rotate / post-delete recovery) call `scrollToPage(index, block)` and a 400 ms suppressor stops the focal observer from racing the smooth-scroll.

### pdf.js worker

`pdfjs-dist/build/pdf.worker.min.mjs?url` resolves through Vite's asset pipeline to a bundled worker — no CDN. Assigned to `GlobalWorkerOptions.workerSrc` in `lib/pdfjs.ts`.

### Persisted state

`electron-store` writes to the platform user-data dir (`%APPDATA%\parchment\parchment.json` on Windows, `~/Library/Application Support/parchment/parchment.json` on macOS, `~/.config/parchment/parchment.json` on Linux). Schema: `{ recents: RecentFile[], version: number }`. Recents are capped at 10 and deduplicated by path.

## Notes panel and markdown export

Every annotation is stamped with a stable UUID at creation and may carry an optional text note. The right-rail **Notes panel** (`Ctrl/Cmd-Shift-N`, View menu, command palette, or the toolbar icon) lists every annotation in the document, grouped by page in collapsible sections. Highlights show a serif italic preview of the underlying text (via `lib/highlightText.ts` + the same text-content cache as snap-to-text and find); freehand drawings show a tiny scaled SVG preview. Click any row to scroll the main view to that page (using the same continuous-scroll smooth jump as Wave 4) and select the annotation. Each row has an inline note editor — click "Add note…" or an existing note to expand a textarea; Enter (without Shift) or blur commits, Esc cancels. Note edits and deletes go through the undo history.

**Export Annotations…** (`Ctrl/Cmd-Shift-E`, File menu, command palette) writes a `${baseName}.annotations.md` sidecar via a native save dialog. The markdown groups annotations by page, renders highlights as blockquotes with a colour label, drawings as bullets, and notes as prose under each entry. Empty docs short-circuit with a "No annotations to export" toast — no dialog. The renderer builds the markdown and hands it across IPC; the main process owns the `fs.writeFile`.

## Text layer, find, and snap-to-text

- The pdf.js text layer renders invisible, selectable spans on top of each page canvas. `Ctrl/Cmd-C` copies the native browser selection. The text layer only receives pointer events in **Select** mode; switching to Highlight / Draw / Erase hands pointer control over to the annotation canvas.
- `Ctrl/Cmd-F` (also `Edit > Find`) opens a thin find bar over the page area. The query runs a case-insensitive substring scan over `page.getTextContent()` for every page, debounced 200 ms. Matches render as translucent yellow rectangles on their page; the current match gets an accent fill and border. `Enter` / `Shift+Enter` and `Ctrl/Cmd-G` / `Ctrl/Cmd-Shift-G` cycle through matches, jumping across pages when needed. `Esc` closes and clears highlights.
- The highlight tool snaps its drag rect to the union of text lines intersected on mouseup. Dragging in a figure or whitespace preserves the raw rect, so image callouts still work.

## Known v1 compromises (carried from prototype)

- **Find is whole-document, case-insensitive substring only.** No whole-word, regex, or incremental scope yet.

## Stack

- electron 31
- electron-vite 2
- electron-store 8
- react 18
- typescript 5.5
- zustand 4
- pdfjs-dist 4
- pdf-lib 1.17
- electron-builder 24

## About menu

The Help menu carries an **About Parchment** entry on Windows and Linux that
opens a small modal listing the app version (from `package.json`), the
embedded Electron and Chromium versions, and the copyright. On macOS the same
information appears under the standard app-menu *About Parchment* item, wired
through `app.setAboutPanelOptions`.

## License

Parchment is released under the MIT License. See [LICENSE](LICENSE).
