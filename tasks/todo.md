# Parchment — Wave 6 + 7 + 9 Plan (focus mode, multi-select, polish + icons)

Prior waves through 5 (continuous scroll + margin notes / markdown export) all
shipped clean.

This plan covers the final pre-ship pass:
- **Wave 6** — Reading focus mode. Small, self-contained. **Shipped.**
- **Wave 7** — Multi-select pages on thumbnails. Medium. **Shipped.**
- **Wave 8** — Split view. **Deferred to v1.1** (user decision after Wave 7).
- **Wave 9** — Polish + icons. App icons, in-app icon consistency, microcopy
  audit, visual polish, distribution-readiness checklist. **Shipped.**

---

## Wave 6 — Reading focus mode

### Goals

A toggleable "reading mode" that dims everything but the page content. Plays
directly to the brand positioning (calm tool, not a feature-stuffed editor).

### Behaviour

Toggle via `F` key, View menu entry "Focus mode", and command palette. When on:
- Sidebar (left), margin-notes (right if open), and toolbar fade to ~10% opacity
  on a brief delay (~600ms) of cursor inactivity over the page area
- Topbar stays visible (it carries the close button) but dims to ~30%
- The dimmed chrome immediately restores to full opacity on any pointer
  movement, key press, or focus shift into the chrome regions
- The page background gets a slightly warmer tint (sepia, very subtle — keep the
  paper feel, don't go full f.lux). Implement via a CSS filter on `.page-stack`
  or by overlaying a soft warm gradient on `#main`.
- Scroll/zoom/annotation behavior unchanged — focus is a chrome treatment only

When off: chrome restores; tint removes.

### Scope — items

- [x] **Store flag** in `state/pdfStore.ts`: `focusMode: boolean`,
  `setFocusMode(on: boolean)`, `toggleFocusMode()`. Default `false`.
- [x] **Idle dimming** via a small new hook `hooks/useFocusModeIdle.ts`:
  attaches `mousemove`, `keydown`, `wheel`, `focusin` listeners on the document
  while `focusMode` is on; debounced 600ms idle timer toggles a `body.idle`
  class. Cleanup on toggle-off and unmount.
- [x] **CSS** in `styles/index.css`: `body.focus-mode #sidebar`,
  `body.focus-mode .margin-notes`, `body.focus-mode #toolbar` get
  `opacity: 1; transition: opacity 240ms ease;` by default; when `body.idle` is
  also set, those drop to `opacity: 0.1`. Topbar drops to `0.3`. The page area
  + scroll container stay full opacity. Add a subtle warm overlay rule
  (e.g. `body.focus-mode #main::before` with a `radial-gradient` of
  `rgba(245, 158, 11, 0.04)` near the top, transitioning in/out).
- [x] **`<body>` class sync** — `App.tsx` toggles `body.focus-mode` based on
  store state via a small `useEffect`.
- [x] **`F` keybinding** in `hooks/useKeyboard.ts` — only when no editable
  field is focused; calls `toggleFocusMode()`.
- [x] **Menu entry** in `src/main/menu.ts`: `View > Focus mode` with
  accelerator `F` (no modifier — let the renderer-side handler win when focus
  is in an input). Sends `view:toggle-focus-mode`. Update preload `MenuCommand`
  type and `App.tsx` dispatcher.
- [x] **Command palette** in `hooks/useCommandPalette.ts`: "Toggle focus mode"
  with `F` shortcut hint.
- [x] **a11y** — when toggled on, `showToast('Focus mode on — press F to
  exit')`. When off, no toast (avoids noise on rapid toggles).

### Wave 6 verification

- [x] `npm run typecheck` clean
- [x] `npm run build` clean
- [ ] Manual: `F` toggles, idle dimming kicks in after ~600ms, mouse motion
  restores instantly, command palette + menu entries work, second `F` exits.

---

## Wave 7 — Multi-select pages on thumbnails

### Goals

Select multiple thumbnails to operate on a range or arbitrary set. Operations:
delete N, rotate N, reorder a block. Drag-reorder treats a multi-selection as a
single block.

### Selection model

- Single click: select that page only (and `currentPage` jumps to it as today).
- `Shift`-click: extend selection from anchor (last single-clicked) to the
  clicked page (inclusive range).
- `Ctrl/Cmd`-click: toggle that page's membership in the selection (without
  changing the anchor or current page).
- Click on an empty area of the sidebar: deselect all.
- Pressing `Escape` while focus is in the sidebar: deselect all.

### Scope — items

- [x] **Store state**: `selectedPages: Set<number>` in `pdfStore.ts`. Use a
  plain object `Record<number, true>` if Set serialization is awkward — but
  Zustand handles Sets fine. Add `selectionAnchor: number | null` (last
  single-clicked index for shift-extend).
- [x] **Selection actions**:
  - `selectPage(index, mode: 'replace' | 'toggle' | 'range')` — replaces the
    selection / toggles membership / extends from anchor, respectively.
  - `clearPageSelection()` — resets `selectedPages` and `selectionAnchor`.
- [x] **Bulk operations** in `pdfStore.ts`:
  - `deleteSelectedPages()` — guards: cannot delete all pages; goes through
    `pushDirtySnapshot` once for the whole batch. Sorts indices descending and
    splices. Adjusts `currentPage` to the next surviving page (or last).
  - `rotateSelectedPages()` — single snapshot; rotates each selected page +90°.
  - `moveSelectedPagesTo(targetIndex)` — single snapshot; extracts selected
    pages, splices them at `targetIndex` (in their original relative order).
  - All bulk ops invalidate find state same as the single-page versions.
- [x] **Thumbnail UI** in `components/Thumbnail.tsx`:
  - Visual selected state: accent-tinted border + small accent badge in the
    corner (or a checkmark glyph). Distinct from the existing "current page"
    accent border — selected pages without focal page get a slightly different
    treatment (dashed accent vs solid accent).
  - Click handler dispatches `selectPage` with the right mode based on
    modifiers (`shiftKey`, `metaKey || ctrlKey`).
  - Hover action buttons show a different label when multi-selected (e.g.
    "Delete 3 pages" instead of "Delete page"). Each button checks if the
    hovered page is in the selection and operates on the selection if so;
    otherwise operates on just the hovered page.
- [x] **Drag-reorder for selections** in `Thumbnail.tsx`:
  - When dragging a thumbnail that is part of the selection, the drag carries
    the entire selection. Show a small badge on the drag visual indicating
    count.
  - On drop: call `moveSelectedPagesTo(dropIndex)` instead of the per-thumbnail
    `movePage`. If the dragged thumbnail isn't in the selection, fall back to
    the existing single-page `movePage`.
- [x] **Toolbar Delete Page button** — when `selectedPages.size > 1`, label
  changes to "Delete N pages" and calls `deleteSelectedPages`. Same for
  Rotate (or leave Rotate as single-page; multi-rotate happens via the
  hover action / thumbnail menu).
- [x] **Sidebar background click** — clicking the sidebar empty area
  (outside thumbnails) clears the selection.
- [x] **Keyboard** in `hooks/useKeyboard.ts`:
  - `Escape` while focus is in `.sidebar-body` → `clearPageSelection`.
  - `Delete`/`Backspace` while focus is in `.sidebar-body` and
    `selectedPages.size > 0` → `deleteSelectedPages`.
- [x] **Command palette** entries:
  - "Delete selected pages (N)" — only when N > 0.
  - "Rotate selected pages (N)" — only when N > 0.
  - "Clear page selection" — only when N > 0.
- [x] **a11y** — every selected thumbnail gets `aria-selected="true"`. The
  thumbnails container gets `role="listbox"` `aria-multiselectable="true"`
  (it's currently not a listbox — check current ARIA, only add if it doesn't
  conflict with the existing tabpanel ancestry).

### Wave 7 verification

- [x] `npm run typecheck` clean
- [x] `npm run build` clean
- [ ] Manual:
  - Single click selects one
  - Shift-click extends
  - Ctrl/Cmd-click toggles
  - Toolbar Delete switches label when multi-selected
  - Drag a multi-selected thumbnail to a new position; whole block moves
  - Esc in sidebar clears selection
  - Bulk delete/rotate goes through one undo entry (single Ctrl+Z restores)
  - Find bar closes on any of the bulk mutations (matches reuse the
    `closeFind()` pattern from Wave 3c patch)

---

## Wave 8 — Split view (DEFERRED to v1.1)

Originally scoped here; user decision after Wave 7 was to skip and ship v1.
Architectural sketch (DocSlot abstraction over `slots: Record<'primary' |
'secondary', DocSlot | null>` with a focused-slot router) preserved in git
history. Re-open as a fresh wave when v1.1 starts.

---

## Wave 9 — Polish + icons

### Theme A — App icons (ship blocker for distribution)

User decision: **placeholder now, polished icon later.** Single-asset
approach — ship one `build/icon.png` at 1024×1024; electron-builder derives
the ICO / ICNS / AppImage variants from the PNG automatically.

- [x] Add `pngjs` devDep (~30 KB pure-JS PNG encoder; no native build).
- [x] `scripts/generate-placeholder-icon.cjs` writes a 1024×1024 PNG: solid
  panel-dark `#111111` background plus an anti-aliased accent-orange
  (`#f59e0b`) disc at `(820, 720)` r=110, nodding at the wordmark's trailing
  accent period.
- [x] `npm run icons` script in `package.json`.
- [x] `build/icon.png` committed (10.9 KB). `.gitignore` doesn't block it.
- [x] `npm run build` clean. `npm run build:win` produces
  `dist/parchment-0.1.0-setup.exe` (NSIS, x64, 96 MB) — the
  `dist/.icon-ico/` cache confirms electron-builder derived the ICO from our
  PNG.
- [x] README packaging section updated with the icon assets + the
  `npm run icons` regeneration script.

### Theme B — In-app polish (surgical, ship-independent)

#### Scope
- [x] **Icon module** — hoisted inline SVGs into
  `src/renderer/src/components/icons/` as named React components
  (`SelectIcon`, `HighlightIcon`, `FreehandIcon`, `EraseIcon`, `RotateIcon`,
  `TrashIcon`, `NotesIcon`) with a barrel `index.ts`. Standardized
  `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
  `strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`. Each
  accepts `React.SVGProps<SVGSVGElement>`. Toolbar + MarginNotes import them;
  Thumbnail / Outline / Sidebar use unicode glyphs (intentional — leave alone).
  Trash dedup spanned 2 files (not 5 as scoped — only Toolbar + MarginNotes
  carried real `<svg>` markup).
- [x] **Microcopy audit** — swept every `showToast` and user-facing label.
  Replaced "Failed to X" with "Couldn't X" across App.tsx, pdfStore.ts,
  PageStackItem.tsx, LinkLayer.tsx; "Save failed" → "Couldn't save";
  "Render failed" → "Couldn't render this page"; "Error:" → "Couldn't export:".
  Close-guard dialog buttons are now [Save | Discard changes | Cancel].
  No exclamation marks or "successfully" left in user-facing strings.
  Empty states already in voice (MarginNotes, Outline, FindBar "No matches",
  EmptyState welcome card).
- [x] **Drag visual cleanup** — replaced the CSS `::after` count badge with a
  custom-canvas `setDragImage`. `makeMultiDragImage` paints the underlying
  thumbnail canvas into a 140-px-wide synthetic image plus an accent pill
  with the count, mounted off-screen for the snapshot then GC'd next tick.
  Existing `.dragging-multi` class still fires for in-place styling.
- [x] **Focus ring sweep** — kept the global `:focus-visible` rule and added
  surgical overrides: thumbnails switch to a single accent box-shadow ring
  (avoids double-ring with the existing border + box-shadow); FindBar input
  and MarginNotes textarea swap to accent border + 1px ring; command palette
  input drops the outer ring (the dialog is already heavy); color swatches
  bump `outline-offset` to 3 px so the ring clears neighbors.
- [x] **Loading + transition polish** — toast slide already 200 ms (verified);
  added 240 ms `find-bar-slide` keyframe for the FindBar entry; added 240 ms
  `margin-notes-slide` for the right-rail panel; added 120 ms
  `command-palette-fade` + `command-palette-pop` keyframes for the modal. Focus
  mode chrome dim and thumbnail placeholders unchanged.
- [x] **Empty state pass** — verified all five paths read in voice: EmptyState
  "Drop a PDF.", Outline "No outline in this document.", MarginNotes "No
  annotations yet. Use H to highlight or D to draw.", FindBar empty (no
  message, intentional), FindBar with no matches "No matches" in danger color,
  Recents only renders when there's at least one entry (no broken layout).
- [x] **Window title** — new `useWindowTitle` hook in `hooks/`, mounted from
  `App.tsx`. Sets `document.title` to `${fileName}${dirty ? ' • ' : ''} —
  Parchment` (Electron mirrors to BrowserWindow); falls back to `Parchment`
  with no doc loaded. Reactive to both fileName and dirty.
- [x] **About menu** — `app.setAboutPanelOptions` on macOS in `main/index.ts`;
  Win/Linux get a Help menu *About Parchment* item that opens
  `dialog.showMessageBox` with version (from `app.getVersion()`), Electron
  version, Chromium version, and copyright. Skipped on macOS where the
  app-menu `role: 'about'` item already wires through.
- [x] **README polish** — verified accuracy; added Distribution section
  (gatekeeper / SmartScreen warnings, AppImage chmod), Icon assets section,
  About menu section, License section pointing at LICENSE.
- [x] **CHANGELOG.md** — bootstrapped with v0.1.0 dated 2026-04-19 covering
  Waves 1, 2, 3a, 3b, 3c, 4, 5, 6, 7, 9 with one-line attribution per wave.
  Wave 8 deferred note included.
- [x] **package.json metadata** — added `license: "MIT"`, `homepage`,
  `repository`, `bugs` (placeholder GitHub URLs under chaostheorystudios org —
  swap when the repo lands publicly). Description + author verified.
- [x] **Distribution-readiness notes** — added in README Distribution section.
  No actual signing wired (out of scope for v1 — credentials needed).

### Wave 9 verification

- [x] `npm run typecheck` clean
- [x] `npm run build` clean
- [x] `npm run build:win` produces `dist/parchment-0.1.0-setup.exe` (96 MB
  NSIS installer, x64). The `dist/.icon-ico/` cache confirms electron-builder
  picked up the placeholder PNG and derived a multi-resolution ICO from it.
- [ ] Manual: Tab through every panel, verify focus rings; toast voice
  consistency; FindBar slide-in; window title updates with filename + dirty.
  (Manual run pending — out of scope for the autonomous Wave 9 pass.)

---

## Review

### Wave 4

Unchanged from prior — full review section preserved below.

### Wave 5

Unchanged from prior — full review section preserved below.

### Wave 6

Shipped a self-contained reading focus mode. `focusMode` flag + `setFocusMode` /
`toggleFocusMode` actions live on `pdfStore`. `F` keybinding (gated by the
existing `inEditable` guard alongside V/H/D/E), View menu entry "Focus Mode"
with accelerator `F` (sending the new `view:toggle-focus-mode` command), and a
"Toggle focus mode" command-palette entry under the View group all dispatch the
same toggle. `App.tsx` syncs `body.focus-mode` and mounts the new
`useFocusModeIdle` hook, which arms a 600ms idle timer (mousemove / keydown /
wheel / focusin reset it) and toggles `body.idle`. CSS adds 240ms ease opacity
transitions on `#sidebar`, `#margin-notes`, `#toolbar`, and `#topbar` under
`body.focus-mode`; on idle the chrome drops to 0.1 opacity (topbar 0.3) while
the page area + scroll container stay full. A subtle warm radial gradient
(`rgba(245, 158, 11, 0.04)`) sits near the top of `#main` via `::before`. Toggling
on fires `showToast('Focus mode on — press F to exit')`; toggling off is silent
to avoid noise on rapid toggles. README updated (focus mode in the feature list,
`F` in the shortcuts table). Typecheck + build clean.

### Wave 7

Shipped multi-select on thumbnails with bulk delete / rotate / drag-reorder.
Store gained `selectedPages: Set<number>` + `selectionAnchor: number | null`,
`selectPage(index, mode)` (`replace` | `toggle` | `range`), `clearPageSelection`,
and three bulk actions `deleteSelectedPages`, `rotateSelectedPages`,
`moveSelectedPagesTo` that each go through one `pushDirtySnapshot` (so a
single Ctrl+Z restores). Bulk delete refuses to empty the doc with a
`'Cannot delete all pages'` toast. `moveSelectedPagesTo` extracts the
selected indices in original order, splices them in at an adjusted target
index, and treats drops inside the selected block as a no-op. Existing
single-page mutations (`movePage`, `deletePage`) now remap `selectedPages`
and `selectionAnchor` so the selection stays coherent across mutations. All
mutating bulk ops mirror the single-page `closeFind()` invalidation.

`Thumbnail.tsx` now dispatches `selectPage` from a single click handler
(modifier-aware: `shiftKey` → `range`, `meta/ctrl` → `toggle`, otherwise
`replace`). Single-click still drives `currentPage` + smooth scroll;
shift/ctrl-click leave the focal page alone. Visual: dashed accent border
plus an `accent-soft` tint for selected, with a small accent badge in the
top-right showing the count when the hovered thumb is part of a >1
selection. Drag of a multi-selected thumb ships an extra
`application/parchment-page-multi` MIME on the drag payload and adds a
`.dragging-multi` class with `data-drag-count` for the corner badge; drop
calls `moveSelectedPagesTo` instead of `movePage`. Hover Move-up/down arrows
hide while multi is active (bulk reorder is the drag path); Rotate / Delete
hover actions become "Rotate N pages" / "Delete N pages" with matching
`aria-label`. Hovering an unselected thumb keeps single-page semantics even
when a selection exists.

Sidebar pages-panel got `role="listbox" aria-multiselectable="true"` on the
thumbnail wrapper, `role="option" aria-selected={isSelected}` on each
thumbnail, and an empty-area click handler that clears the selection.
Toolbar Delete switches to "Delete N pages" + bulk handler when
`selectedPages.size > 1` (disabled if it would empty the doc); Rotate stays
single-page (multi-rotate goes via thumb hover or palette). `useKeyboard`
gained sidebar-scoped `Esc` (clears selection) and `Delete`/`Backspace`
(bulk delete). Command palette adds three Page-group entries gated on
`selectedPages.size > 0`: delete / rotate / clear. README updated with the
feature line and the Shift / Ctrl-click + sidebar-scoped Esc / Delete
shortcuts. Typecheck + build clean.

### Wave 10 — Render sharpness

Fixed the README-documented "render scale is tied to display scale" compromise.
Every rasterizing canvas (PDF, annotations, find matches, thumbnails) now uses
a DPR-aware pattern: bitmap dims at `displayScale × devicePixelRatio`, CSS dims
at `displayScale`. On a high-DPI display the browser now downsamples a
higher-resolution bitmap instead of upscaling CSS-pixel pixels. All coord math
(`pageNativeBboxToDisplayRect` and friends) stays in CSS pixels — DPR shows up
only inside `pdfRender.ts`, the canvas-size setters, and a one-time
`setTransform(dpr, 0, 0, dpr, 0, 0)` on each 2d context we draw to imperatively.

Text layer now receives a CSS-space viewport (no DPR multiplier) against a
CSS-sized container — pdf.js positions transparent spans at CSS-pixel
coordinates over the canvas, native selection keeps working because browsers
select in CSS space. Thumbnail base scale bumped from `0.2` to `0.4` via the
existing `THUMB_SCALE` constant, with an explanatory comment; the bitmap now
comfortably covers the ~210 CSS-px sidebar content width before DPR is
multiplied in. The old `.thumb canvas { width: 100%; height: auto }` rule
(which forced the browser to interpolate the bitmap to fit the column) was
replaced with `max-width: 100%`, so the explicit JS-set CSS dims win.

Live DPR-change handling via a new `hooks/useDevicePixelRatio.ts` —
`matchMedia('(resolution: {dpr}dppx)')` re-arms on every DPR change, and both
`PageStackItem` and `Thumbnail` list DPR in their render-effect deps so moving
the window between monitors triggers a natural re-render.

Input handling in `PageStackItem.canvasPoint` was simplified — previously it
multiplied by `canvas.width / rect.width` to convert to bitmap coords; now it
returns plain CSS-pixel coords and the drawing transform scales them up
invisibly. This lines up with `hitAnnotation` + `pageNativeBboxToDisplayRect`
(both CSS-space) so selection, drag, and draw all share one coordinate system.

Save pipeline, annotation storage (page-native pt), zoom-to-cursor math, and
the rotation helpers are all untouched — the change is strictly render-side.

**Files modified:**
- `src/renderer/src/lib/pdfRender.ts`
- `src/renderer/src/components/PageStackItem.tsx`
- `src/renderer/src/components/Thumbnail.tsx`
- `src/renderer/src/hooks/useDevicePixelRatio.ts` (new)
- `src/renderer/src/constants/index.ts`
- `src/renderer/src/styles/index.css`
- `README.md`
- `CHANGELOG.md`

`npm run typecheck` + `npm run build` clean.

### Wave 9

Final pre-ship pass — placeholder app icon plus an in-app polish sweep across
icons, microcopy, focus management, transitions, and packaging metadata. No
feature changes.

**Theme A — Placeholder app icon.** `build/icon.png` (1024 × 1024) ships as
the single icon source; electron-builder auto-derives the platform variants
(confirmed by the `dist/.icon-ico/` cache after `npm run build:win`).
Generated by `scripts/generate-placeholder-icon.cjs`, exposed via
`npm run icons`. The script depends only on `pngjs` (the lone new
devDependency), allocates a 1024 × 1024 RGBA buffer, fills with panel-dark
`#111111`, and paints an anti-aliased accent-orange disc at (820, 720)
r=110 — a nod at the wordmark's trailing accent period. A polished
mark-driven icon is left for a later pass.

**Theme B — In-app polish.** Refactored the inline SVGs scattered across
Toolbar and MarginNotes into named components under
`src/renderer/src/components/icons/` (Select / Highlight / Freehand / Erase /
Rotate / Trash / Notes), each typed with `React.SVGProps<SVGSVGElement>` and
standardized to `viewBox="0 0 24 24"`, `stroke="currentColor"`,
`strokeWidth={2}` with rounded line caps. Microcopy audit replaced every
"Failed to X" with "Couldn't X", swapped "Save failed" / "Render failed" /
"Error:" for the same calmer pattern, and softened the close-guard dialog
button to "Discard changes". A new `useWindowTitle` hook syncs
`document.title` to `${fileName}${dirty ? ' • ' : ''} — Parchment` and
Electron mirrors it to the BrowserWindow. About-Parchment lands in the Help
menu on Win/Linux (manual dialog with version, Electron, Chromium, copyright)
and via `app.setAboutPanelOptions` on macOS.

Multi-select drag now ships a `setDragImage` canvas with the count baked into
an accent pill — replaces the prior `::after` badge that browsers don't
always snapshot. Focus-ring sweep kept the global `:focus-visible` rule and
added per-control overrides where the default outline collided with existing
borders / shadows (thumbnails, FindBar input, command palette input, color
swatches, MarginNotes textarea). FindBar gained a 240 ms slide-in, the
command palette modal gained a 120 ms fade + pop, and the MarginNotes panel
gained a 240 ms slide from the right.

Packaging-readiness items: `package.json` now carries `license: "MIT"`,
`homepage`, `repository`, `bugs` (placeholder GitHub URLs under
chaostheorystudios org); root `LICENSE` (MIT, © 2026 Chaos Theory Studios)
and `CHANGELOG.md` (v0.1.0 dated 2026-04-19, one-line per-wave attribution)
created. README adds Icon assets, About menu, Distribution (gatekeeper /
SmartScreen / AppImage notes), and License sections. `npm run typecheck`,
`npm run build`, and `npm run build:win` all clean — the win installer
weighs 96 MB at `dist/parchment-0.1.0-setup.exe`. No code signing wired
(needs credentials we don't have).
