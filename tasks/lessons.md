# Parchment — Lessons & recurring issues

## electron-vite scaffold: `baseUrl` deprecation in `tsconfig.web.json`

**Symptom**
```
Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.
```

**Why it happens**
The electron-vite React+TS template generates `tsconfig.web.json` (and sometimes others) with `"baseUrl": "."` plus a `paths` mapping for the `@renderer/*` alias. TypeScript 5.x has deprecated `baseUrl` as a standalone option; it's slated for removal in TS 7.0. Every fresh electron-vite scaffold will trip this.

**Preferred fix — remove `baseUrl` entirely**
`paths` has worked without `baseUrl` since TS 5.0. Paths resolve relative to the tsconfig file's directory when `baseUrl` is absent. When making the change, prefix each `paths` entry with `./` so the relative resolution is unambiguous:

```jsonc
// Before
"baseUrl": ".",
"paths": {
  "@renderer/*": ["src/renderer/src/*"]
}

// After
"paths": {
  "@renderer/*": ["./src/renderer/src/*"]
}
```

Vite's runtime alias resolution lives in `electron.vite.config.ts` under `resolve.alias` and is independent of the tsconfig — removing `baseUrl` does not affect the bundler.

**Stopgap fix (not recommended)**
`"ignoreDeprecations": "6.0"` silences the warning but the option stops *functioning* in TS 7.0 regardless. Only use this if you need `baseUrl` for some non-paths reason (rare).

**Check the sibling tsconfigs too** — node/main/preload configs in the same scaffold usually don't have `baseUrl`, but worth a glance.

---

## electron-vite scaffold: `composite: true` without `outDir` in `tsconfig.web.json` / `tsconfig.node.json`

**Symptom (IDE only — CLI typecheck passes)**
```
Cannot write file 'src/preload/index.d.ts' because it would overwrite input file.
```

**Why it happens**
The scaffold ships both `tsconfig.web.json` and `tsconfig.node.json` with `composite: true` and no `outDir`. `composite` requires TypeScript to be able to emit declaration files; without `outDir`, emission goes next to each input. Either config also includes `src/preload/index.d.ts` (web includes it explicitly for the `window.api` ambient typing; node includes it via `src/preload/**/*`). When TS plans emission it would write `.d.ts` at the same path as the existing input → refuses.

The CLI `typecheck` script dodges this via `tsc --noEmit -p tsconfig.web.json --composite false` — the `--composite false` override disables the check. The IDE language service uses the raw config and surfaces the error.

**Preferred fix — redirect emission to a cache dir**

```jsonc
// tsconfig.web.json compilerOptions
"outDir": "node_modules/.cache/tsc-web"

// tsconfig.node.json compilerOptions
"outDir": "node_modules/.cache/tsc-node"
```

The cache dir is gitignored via `node_modules`. Emission still doesn't actually run (`--noEmit` is in the CLI), but the language service stops complaining because output paths no longer collide with inputs.

**Alternatives considered and rejected**
- **Remove `composite: true`** — breaks the project-references model in `tsconfig.json`.
- **Add `noEmit: true`** — fights with `composite` in older TS; TS warns about the combination.
- **Exclude the `.d.ts` from the include** — the renderer needs those ambient types.
- **Move the `Window.api` augmentation out of preload** — larger refactor; the preload-owned-declaration pattern is idiomatic.
