import { defineConfig } from "tsdown";

export default defineConfig({
    entry: { index: "src/index.ts" },
    format: "esm",
    platform: "browser",
    // Keep `.js` / `.d.ts` explicitly, so `main`, `types` and `exports` in package.json
    // do not depend on tsdown's extension defaults.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    sourcemap: true,
    dts: true,
    clean: true
});
