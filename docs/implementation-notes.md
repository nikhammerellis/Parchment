# What's in it

- View: page navigation, zoom, thumbnail sidebar (click to jump)
Page ops: rotate, delete, reorder (up/down on thumbnail hover)
- Annotations: highlight rectangles + freehand pen, 6 colors, per-page erase
- Merge: append pages from a second PDF
- Save: bakes all changes (rotation, deletions, reordering, merged pages, annotations) into a new PDF via pdf-lib and downloads it
- Keyboard: V/H/D/E for tools, R to rotate, arrows for pages, ⌘/Ctrl-S to save

## Architecture worth knowing before buildout
The state shape is the main thing to preserve when you refactor:
```
state.sources[key] = { bytes, pdfjsDoc }     // raw bytes + pdf.js doc per file
state.pages = [{ sourceKey, srcIndex, rotation, annotations }]  // ordered
```

Pages reference their source by key + original index, which is what makes merge-then-reorder-then-save work cleanly. Save pipeline: load each source into pdf-lib, copy pages in state.pages order, apply rotation on top of any existing page rotation, bake annotations with coordinates converted display-px → PDF points and Y-flipped.

## Known v1 compromises (flag these for buildout)

- Annotations clear on rotate — keeping them aligned through rotation needs a transform matrix per annotation. I punted and clear them with a toast.
- No undo/redo — add a history stack in state for buildout.
- Freehand is baked as line segments, not a smooth bezier path. pdf-lib supports drawSvgPath if you want smoother output.
- Render scale is tied to display scale — for a real app, decouple them so zoom doesn't re-rasterize.
- No persistence — reloading the page loses everything. localStorage for in-progress docs would be nice but PDFs can be large.

Buildout targets that make sense

- Electron — local file associations, native file dialogs, proper "open with Parchment" on Windows. Probably the closest fit to competing with PDFgear.
- Next.js — if you want a web version for cross-device access. PDF.js + pdf-lib both work server-side too if you want server-side rendering for thumbnails.
- Vite SPA — simplest path if you just want to clean up the structure and deploy static.

Your prototype-buildout skill should handle the scaffolding nicely. If you point Claude Code at this file and pick a target, the state shape and save pipeline will translate straight across — the main work is splitting the script tag into modules (state.js, render.js, annotations.js, save.js, ui.jsx) and swapping the custom CSS for whatever component system you want.