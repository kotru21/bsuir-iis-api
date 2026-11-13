import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Declarations come from oxc's isolated-declarations emitter: no TypeScript compiler API
  // involved, so the build does not depend on the TypeScript version (TypeScript 7.0 only
  // offers rolldown-plugin-dts a deprecated `tsgo` CLI fallback). `src` is checked with
  // `isolatedDeclarations` in tsconfig.baseline.json, so every export stays annotated.
  // No declaration map: it would point at `src/`, which is not published, so "go to
  // definition" in consumers' editors would lead nowhere. The .d.ts carries the JSDoc.
  dts: { generator: "oxc", sourcemap: false },
  sourcemap: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  // Keep .js/.d.ts (not .mjs/.d.mts): the package is "type": "module", and the
  // published file names are part of the existing package layout.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" })
});
