# ASMO-8501 – Replace the esbuild + tsc build with tsdown

> Taken over from vault-client-sag (MET-5031, `.plans/MET-5031-3-bundler-tsdown.md`, commits 9d72067, 1fb8485) and adjusted.
> Follows `.plans/ASMO-8501-eslint-10-typescript-6.md` (ESLint 10, Prettier 3, TypeScript 6, `lib/` → `dist/`).
> One commit per step (baseline → tsdown + `package.json` + `tsconfig.json` → CI → VS Code); every commit must leave
> `yarn lint`, `yarn typecheck` (once it exists) and `yarn build` green.

## Rationale

The build is two tools glued together in one script: `tsc --emitDeclarationOnly` writes one `.d.ts` per source file,
and `esbuild` bundles the JavaScript and writes a `meta.json` that nobody uses. tsdown (built on Rolldown, the
successor of tsup) does both in one step: it bundles the JavaScript, bundles the declarations into one `index.d.ts`,
externalizes `dependencies` and cleans `dist/`. vault-client-sag already uses it, so the `sag-js` libraries share
one build setup and one config file shape (`tsdown.config.mts`).

The package is already ESM (`"type": "module"`) and runs in the browser and in Chrome extensions, so unlike
vault-client-sag there is no format change and no Node target. The published package must stay equivalent for
consumers: same runtime exports, same external imports, same typings API, still with a source map.

## Acceptance criteria

### Baseline (before switching)

- [x] A baseline of the current esbuild build is saved outside the repo (e.g. in a scratch folder): `dist/` after a
      clean build, the `npm pack --dry-run` file list, raw and gzip size of `dist/index.js`, and the
      `esbuild --analyze` output. Done: 10 files in `dist/` (8 `.d.ts`, `index.js`, `index.js.map`); `index.js` is
      12,686 B raw / 2,782 B gzip, and `AuthPlugin.ts` is 75% of it.

### tsdown

- [x] `esbuild` is removed from `devDependencies`. `tsdown` is added as `~0.23.5` (same as vault-client-sag; it is
      still 0.x, so pinned to the minor). The version passes the `npmMinimalAgeGate`.
      Done: `yarn add -D tsdown@~0.23.5` kept the range; the lockfile resolves 0.23.7 (Rolldown 1.3.1).
- [x] `tsdown.config.mts` is added (see Technical details) and `build` is changed to `tsdown`.
- [x] `typecheck: tsc` is added. `tsconfig.json` gets `noEmit: true`; `outDir`, `declaration` and `rootDir` are
      removed, as long as tsdown still emits the declarations without them. Done: none of them is needed.
- [x] `--metafile=meta.json` is gone, `meta.json` is removed from `.gitignore` and the local `meta.json` is deleted.
- [x] `main` and `exports` in `package.json` are unchanged (`dist/index.js`, `dist/index.d.ts`). `typings` is renamed
      to `types` (same value), like in vault-client-sag.
- [x] `yarn dedupe` is run, so esbuild leftovers leave `yarn.lock` (tsdown does not depend on esbuild).
      Done: `yarn.lock` has no `esbuild` entry any more.

### Output compared with the baseline

- [x] **External imports:** `dist/index.js` imports exactly the same bare specifiers as before (`axios` is type-only
      and does not appear at runtime; `emittery`, `keycloak-js`, `lodash-es`, `uuid`). None of them is bundled.
      Done: the same four imports; only the local alias changed (`v4 as uuidv4` → `v4`).
- [x] **Runtime exports:** `dist/index.js` exports the same names as before (`default`, `AuthEventNames`,
      `AuthEvents`, `AxiosAuthInterceptor`, `LocalStore`, `ChromeStore`), checked by importing the built file.
      Done: `import("./dist/index.js")` in Node 24 returns these six names; the circular import loads fine.
- [x] **Typings:** the 8 `.d.ts` files become one bundled `dist/index.d.ts` with the same public API. A small
      consumer `.ts` file that uses the default export, `AuthOptions`, `Store`, `LocalStore`, `ChromeStore`,
      `AuthEvents` / `AuthEventNames` and `AxiosAuthInterceptor` type-checks against both the old and the new output.
      Done: checked with `strict`, `skipLibCheck: false` and `types: []`; both pass.
- [x] **Types resolution:** `attw --pack --profile esm-only` reports no problems (run once by hand with `yarn dlx`,
      not added to the config, see Technical details). Done: `node16 (from ESM)` and `bundler` are green; the CJS
      warning is ignored by the profile, as intended.
- [x] **No `@types/chrome` leak:** `dist/index.d.ts` has no `/// <reference types="chrome" />` and no `chrome.*`
      type, so consumers without `@types/chrome` still compile (same as today). Done: the consumer check above ran
      with `types: []`.
- [x] **Size:** raw and gzip size of `dist/index.js` are comparable to the baseline (no dependency inlined, no
      helper bloat). Differences are explained in this plan. Done: 11,309 B raw / 2,554 B gzip (−11% / −8%).
      Rolldown prints the same code more compactly.
- [x] **Package content:** `npm pack --dry-run` lists only `LICENSE`, `README.md`, `package.json`,
      `dist/index.js`, `dist/index.js.map` and `dist/index.d.ts` (no `.d.ts.map`, no extra chunks).
      Done: exactly these 6 files, 10.7 kB packed instead of 11.3 kB.
- [x] **Source map:** `dist/index.js.map` maps back to `src/*.ts` (`sources` / `sourcesContent` present, like esbuild).
- [x] **Smoke test:** the packed tarball works in a consuming Vue app (login, token refresh, logout).
      Done in selfserviceportal (`Sources/App`).

### CI and tooling

- [x] `.github/workflows/ci.yaml` runs `yarn typecheck` before `yarn build`, because `tsc` no longer runs in the build.
- [x] `.vscode/settings.json` nests `tsconfig.*` under `tsdown.config.*`, like vault-client-sag.
- [x] CI passes (verify on the PR). All CI steps (lint, typecheck, build) pass locally.

### Security updates

- [x] `yarn npm audit --environment production --recursive` reports no advisories. Done: `axios` 1.18.1 → 1.21.0
      (`^1.21.0`; 12 advisories, fixed in 1.20.0) and `follow-redirects` 1.16.0 → 1.16.3 (3 advisories, refreshed
      within axios' range with `yarn up -R`). `dist/` does not change, because `axios` is only imported as a type.
- [ ] Dev advisories from `yarn npm audit --all --recursive` are fixed where possible. Still open: `minimatch`
      10.2.6 (moderate, ESLint only). The fix needs `eslint` 10.15.0 (needs `minimatch ^11.0.5`),
      `@eslint/config-array` 0.23.6 and `@typescript-eslint/typescript-estree` 8.73.0, which are all younger than the
      14-day age gate (earliest ~2026-11-30). Then run `yarn up eslint@^10.15.0`,
      `yarn up -R @eslint/config-array typescript-eslint` and `yarn dedupe`.

## Technical details

### `tsdown.config.mts`

Same shape as vault-client-sag, adjusted for a browser library. `.mts` like there; `.ts` would also work, because
the package is `"type": "module"`, but the same file name in all `sag-js` repos is easier to find. It is already
covered by the `app/typescript` block in `eslint.config.ts` (`**/*.{ts,mts}`).

- `entry: { index: "src/index.ts" }`, `format: "esm"`.
- `platform: "browser"`: the package is only used in web apps (Vue apps and Chrome extensions) and uses
  `localStorage` and `chrome.storage`. esbuild's default platform is also `browser`, so resolution behaves like before.
- No `target`: esbuild used `--target=esnext`, and tsdown does not lower syntax when no target is set (no
  `engines.node` in `package.json`, and the tsconfig `target` is `ESNext`). Lowering is the consumer's bundler's job.
- `sourcemap: true`: the package ships `index.js.map` today. Check that it does not also emit `index.d.ts.map`
  (would point to `src/`, which is not published); if it does, turn declaration maps off in the `dts` options.
- `dts: true`, `clean: true`.
- `outExtensions: () => ({ js: ".js", dts: ".d.ts" })`, kept from vault-client-sag so `main`, `types` and
  `exports` never depend on tsdown's extension defaults (for `platform: "browser"` the defaults are already `.js` /
  `.d.ts`, so this is only a safeguard).
- No `outputOptions.strict` (ESM is always strict), no `minify` (esbuild did not minify either).
- No `publint` / `attw` options: they need extra devDependencies (`publint`, `@arethetypeswrong/core`) and the other
  `sag-js` packages do not use them either. `attw` is only run once by hand for the acceptance check, with
  `--profile esm-only`, because the package has no `require` condition on purpose and plain `attw` would report that
  for `node10` / `node16-cjs`.

### Dependencies stay external

esbuild used `--packages=external`, which externalizes every bare import. tsdown externalizes `dependencies` and
`peerDependencies` from `package.json`. All runtime imports (`emittery`, `keycloak-js`, `lodash-es`, `uuid`; `axios`
only as type) are in `dependencies`, so the result is the same. If tsdown ever bundles something it would print a
warning; the external-imports check above catches it. `chrome` is a global from `@types/chrome`, not an import.

### Typings

tsdown's dts plugin bundles everything reachable from `src/index.ts` into one `index.d.ts`. `exports` already blocks
deep imports such as `@samhammer/authentication-vue/dist/Store`, so consumers can only reach the root, and collapsing
8 files into one is not a breaking change. External type imports (`emittery`, `keycloak-js`, `axios`) stay as
`import` statements, like today. `AuthPlugin` and `StoreProvider` are only internal declarations in the bundle; the
default export keeps its type.

`src/AxiosAuthInterceptor.ts` imports `./index` (circular import, for `Auth`). esbuild handled it; check that
Rolldown does too (no TDZ error when the module loads; covered by the runtime-exports check and the smoke test).

### `package.json`

- `build`: `tsdown`. `typecheck`: `tsc`.
- devDependencies: remove `esbuild`, add `tsdown@~0.23.5`. 0.23.5 is older than the 14-day `npmMinimalAgeGate`.
  The previous plan noted that `yarn add` saves exact versions in this repo; `yarn add -D tsdown@~0.23.5` keeps the
  range as written, otherwise fix it by hand.
- `main`, `exports`, `files` stay.
- `typings` → `types`, same value. TypeScript treats both fields as the same, and with `exports` present, modern
  resolution (`bundler`, `node16`, `nodenext`) reads `exports["."].types` anyway; only `node10` falls back to the
  top-level field, and it accepts `types`. So consumers are not affected, unlike a path change.

### `tsconfig.json`

`tsc` only type-checks now: `noEmit: true`, and `outDir`, `declaration`, `rootDir` are removed (`rootDir` was only
added for TS 6 declaration emit, TS5011). vault-client-sag showed that tsdown's dts plugin still emits declarations
with `noEmit: true`. `types: ["node", "chrome"]`, `lib: ["ESNext", "DOM", "DOM.Iterable"]`, `verbatimModuleSyntax`
and `moduleResolution: "bundler"` stay. If the dts build needs any of the removed options, keep them and note why.

### CI

Add `- run: yarn typecheck` before `- run: yarn build`. The reviewdog ESLint step stays as it is; pinning actions to
SHAs like vault-client-sag is not part of this plan.

### VS Code

Add `"tsdown.config.*": "tsconfig.*"` to `explorer.fileNesting.patterns` (vault-client-sag also nests
`vitest.config.*` there, which this repo does not have).

### Comparing old and new output

1. On the current commit: delete `dist/`, run `yarn build`, copy `dist/`, run `npm pack --dry-run`, measure
   `dist/index.js` (raw and `gzip -c | wc -c`), and run
   `esbuild ./src/index.ts --bundle --packages=external --format=esm --analyze --outdir=<scratch>` for the module
   breakdown. Do this before esbuild is removed.
2. After the switch: repeat the build and pack, then compare the `import` lines of `dist/index.js`, the exports
   (`node --input-type=module -e "import('./dist/index.js')"` needs browser globals only when the plugin is used, so
   listing the exports works in Node; if not, compare the `export { … }` statement), the typings via the consumer
   file (type-check it once with `paths` pointing at the baseline folder and once at the new `dist/`), and run
   `attw --pack`.
3. Smoke test: `npm pack`, install the tarball in a consuming Vue app, run it against Keycloak.

### Things to watch

- tsdown needs Node `^22.18 || ^24.11` to build. Volta pins 24.22.1, so CI and local builds are fine; consumers are
  not affected.
- `clean: true` deletes the old per-file `.d.ts` files in `dist/`, which esbuild/tsc never cleaned.

### Out of scope

Vitest, the ESM switch (already `"type": "module"`), the Node/Volta version, updating `@types/chrome` or runtime
dependencies beyond the security fixes, `publint` / `attw` in the build.

### Security updates

Same approach as vault-client-sag (MET-5031): only versions older than the 14-day `npmMinimalAgeGate`. `yarn up`
saves exact versions in this repo, so the `^` range for `axios` is set by hand. `axios` stays in `dependencies`
(it is part of the public typings via `AxiosInstance`); raising the lower bound to `^1.21.0` keeps consumers from
resolving a vulnerable version through this package.
