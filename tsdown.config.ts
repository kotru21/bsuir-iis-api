import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Native dts generation (rolldown-plugin-dts). Replaces tsup's experimentalDts,
  // which injected a deprecated `baseUrl` under TypeScript 6+.
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  // Keep .js/.d.ts (not .mjs/.d.mts): the package is "type": "module", and the
  // published file names are part of the existing package layout.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" })
});
