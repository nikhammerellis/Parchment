# Changelog

All notable changes to Parchment.

## [Unreleased]

### Fixed

- File-association launches (Open With → Parchment) now actually open the
  PDF instead of landing on the empty state. Main process captures the path
  from `process.argv` (Win/Linux) or `app.on('open-file')` (macOS), queues it
  if the renderer hasn't mounted, and dispatches the existing
  `file:open-path` MenuCommand once `did-finish-load` fires. Single-instance
  lock added so launching with a second PDF reuses the running window
  instead of spawning a duplicate process.

### Changed

- (Wave 10) DPR-aware rendering across every raster layer — PDF canvases,
  annotation canvases, find-match canvases, and sidebar thumbnails now raster
  at `displayScale × devicePixelRatio` with CSS dims at `displayScale`, so
  the browser no longer upscales CSS-pixel bitmaps on high-DPI displays.
  Text layer fed a CSS-space viewport against a CSS-sized container; native
  selection still works. Thumbnails also bumped from a `0.2` base render
  scale to `0.4` so the bitmap comfortably covers the sidebar's content
  width before DPR is applied. Live re-render on DPR change via a
  `useDevicePixelRatio` hook that listens on `matchMedia('(resolution: …)')`.

## [0.1.0] — 2026-04-19

Initial release.

### Features

- (Wave 1) Electron + React 18 + TypeScript scaffold; native file dialogs; Open / Save / Merge; recent files
- (Wave 2) Undo / redo; rotation-aware annotations; bezier-smoothed freehand; recent files via electron-store; zoom presets; zoom-to-cursor; annotation selection; thumbnail drag-reorder; clickable internal and external links; outline / bookmarks; command palette
- (Wave 3a) Comprehensive a11y pass — color swatches, drop zone, toast live region, command palette dialog semantics, focus management
- (Wave 3b) Skip link; outline tree ARIA; password-protected detection; thumbnail virtualization; click-to-edit page indicator; Ctrl+Y redo; many UX papercuts
- (Wave 3c) pdf.js text layer; native text selection + copy; find-in-document; snap-to-text highlights
- (Wave 4) Continuous scroll with virtualized pages; focal page detection; smooth scroll-to-page channel
- (Wave 5) Margin notes panel; per-annotation notes; markdown export
- (Wave 6) Reading focus mode with idle dimming
- (Wave 7) Multi-select pages on thumbnails; bulk delete / rotate / reorder in one undo step
- (Wave 9) Placeholder app icon; icon module refactor; microcopy audit; window title sync; About menu; CHANGELOG and LICENSE; focus-ring sweep; drag-image canvas for multi-select; transition polish

### Deferred

- Wave 8 (split view) — postponed to v1.1
