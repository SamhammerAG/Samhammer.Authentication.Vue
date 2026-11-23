# ASMO-8501 – Update ESLint 10, Prettier 3 and TypeScript 6

> Taken over from Samhammer.SocketServer (ASMO-8500, `Samhammer.SocketServer.ApiClient.JS`) and adjusted.
> One commit per step (ESLint → Prettier → TypeScript → VS Code → CI → `lib/` → `dist/`); every commit must leave `yarn lint` and `yarn build` green.

## Rationale

ESLint 8 and 9 are EOL. ESLint 10 drops the legacy `.eslintrc` format, so the config has to move to flat config,
and the old plugins (`@typescript-eslint` v5, `eslint-plugin-import`, `eslint-plugin-prettier`) don't support it.
Prettier 2 and TypeScript 4.7 are outdated as well; TypeScript 6 deprecates `moduleResolution: "node"` and no longer
accepts `importsNotUsedAsValues`. Unlike SocketServer, the JavaScript is bundled by `esbuild`, and `tsc` only emits the
`.d.ts` files (`--emitDeclarationOnly`). The published package output (JS bundle, sourcemap, typings) must stay the same.
Runtime code only changes where new rules require it.

## Acceptance criteria

- [x] `eslint` is updated to `^10` and `@eslint/js` `^10` is added.
- [x] `.eslintrc.cjs`, `.eslintsag.cjs` and `.eslintignore` are replaced by a single `eslint.config.ts` (loaded via `jiti`).
- [x] `@rushstack/eslint-patch`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-import`
      and `eslint-plugin-prettier` are removed. `typescript-eslint` (v8), `eslint-plugin-import-x`, `globals` and `jiti` are added.
- [x] `eslint-config-prettier` is updated to `^10` and used via `eslint-config-prettier/flat`.
- [x] All current SAG rules are still active with the same severity.
- [x] The build output folder and `.yarn/` are ignored by ESLint.
- [x] The `lint` script is `eslint .` (no `--fix`). New findings are fixed or turned off with a short justification.
- [x] `prettier` is updated to `^3.9`, the `format` script is `prettier --write --experimental-cli src/`.
- [x] `typescript` is updated to `~6.0.3` and `tsconfig.json` is cleaned up (see Technical details) without deprecation errors.
- [x] `yarn build` produces the same files as before (`index.js`, `index.js.map`, `index.d.ts`, … directly in the output
      folder, not in `src/` below it), with equivalent content.
- [x] VS Code "fix all on save" works with the flat config; file nesting is aligned with the other `sag-js` projects.
- [ ] The CI workflow (reviewdog ESLint, build) passes with ESLint 10 (verify on the PR).
- [x] The build output folder is renamed from `lib/` to `dist/` (see Technical details).
- [x] `AGENTS.md`, `CLAUDE.md` and `.plans/AGENTS.md` are added like in SocketServer.

## Technical details

### Packages

| remove | add / update |
| --- | --- |
| `eslint@8` | `eslint@^10.13`, `@eslint/js@^10` |
| `@rushstack/eslint-patch` | – (not needed with flat config) |
| `@typescript-eslint/eslint-plugin@5`, `@typescript-eslint/parser@5` | `typescript-eslint@^8.72.0` (peer `typescript >=4.8.4 <6.1`) |
| `eslint-plugin-import@2` | `eslint-plugin-import-x@^4.17` |
| `eslint-config-prettier@8`, `eslint-plugin-prettier` | `eslint-config-prettier@^10` |
| `prettier@2` | `prettier@^3.9.10` |
| `typescript@4` | `typescript@~6.0.3` |
| – | `globals`, `jiti@^2` |

Use the same versions as in SocketServer, unless the `npmMinimalAgeGate` in `.yarnrc.yml` blocks them. Run `yarn dedupe` afterwards.
Result: all SocketServer versions installed. `yarn add` saves exact versions here, so the `^` / `~` ranges were added by hand.
`esbuild`, `@types/*` and the runtime dependencies are not part of this update.

### `eslint.config.ts`

Same structure as in SocketServer (`defineConfig`, `globalIgnores`, named blocks):

1. `globalIgnores(["dist/", ".yarn/"])` replaces `.eslintignore` (use `lib/` until the rename step).
2. `app/typescript` (`**/*.{ts,mts}`): `js.configs.recommended` + `tseslint.configs.recommended`, `globals.browser`
   (the library runs in the browser and in Chrome extensions; `chrome` comes from `@types/chrome`, and `no-undef` is off for TS files).
   Rules: `@typescript-eslint/consistent-type-imports`, `@typescript-eslint/explicit-member-accessibility`: `error`.
   The `no-console: off` / `no-debugger: off` overrides are dropped (`no-console` is not in recommended, so `AuthLogger` stays allowed).
3. `app/imports` (`**/*.{ts,mts,js,mjs}`): `import-x/first`, `import-x/newline-after-import`, `import-x/no-duplicates`,
   `import-x/no-self-import`: `error`.
4. `eslint-config-prettier/flat` last.

### Prettier

`.prettierrc.json` stays. Its override for `*rc.js` / `*rc.cjs` is not needed after the `.cjs` configs are gone and can be removed.
Check that Prettier 3 doesn't change `src/` (changed defaults such as `trailingComma` are already set explicitly).

### `tsconfig.json`

`tsc` only emits declarations (`--emitDeclarationOnly`), so `outDir`, `declaration: true`, `types: ["node", "chrome"]` and
`lib: ["ESNext", "DOM", "DOM.Iterable"]` stay.

- `moduleResolution`: `"node"` → `"bundler"` (matches the esbuild build).
- `importsNotUsedAsValues` (removed in TS 5.5) → `verbatimModuleSyntax: true`. esbuild respects it, so check that the bundle stays the same.
- Add `rootDir: "./src"`: TS 6 defaults `rootDir` to the tsconfig directory, which would emit `lib/src/index.d.ts` and break
  `typings` and `exports["."].types` in `package.json`.
- Drop options that are TS 6 defaults or unused: `esModuleInterop`, `forceConsistentCasingInFileNames`,
  `useDefineForClassFields`, `noImplicitThis` (part of `strict`), `jsx`, the `src/**/*.tsx` include, `exclude`.
- Verify by building before and after the change and diffing the output folder (`.d.ts` files and the esbuild bundle).
  Expect differences in line endings only (TS 6 emits LF).
  Result: the esbuild bundle and sourcemap are byte-identical, the `.d.ts` files differ in line endings only.

### VS Code

`.vscode/settings.json`: add `"editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" }` and the same
`explorer.fileNesting` patterns as in SocketServer. Fix the trailing comma in `search.exclude`.

### CI (`.github/workflows/ci.yaml`)

- `reviewdog/action-eslint` passed `eslint_flags: "--ext .ts src"`. ESLint 10 still accepts `--ext` (re-added in 9.21),
  but with flat config it is redundant, because the `files` patterns in `eslint.config.ts` choose the extensions, so the flag
  is now `src`. Verify on the PR that reviewdog works with ESLint 10; if it doesn't, replace it with a plain `yarn lint` step.
- No separate typecheck step needed: `yarn build` runs `tsc` and fails on type errors.

### Output folder `lib/` → `dist/`

Do this last, to match the other `sag-js` projects. Change it in `package.json` (`main`, `typings`, `exports`, `files`, and
`--outdir` in the `build` script), `tsconfig.json` (`outDir`), `.gitignore`, `eslint.config.ts` (ignores) and
`.vscode/settings.json` (`search.exclude`). Consumers import by package name only, so the published entry points keep working.

### Out of scope

Vitest, tsdown or replacing esbuild, updating `@types/chrome` and the Node/Volta version.
