import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Use API Extractor rollup instead of the default Rollup+DTS path, which injects a
  // deprecated `baseUrl` under TypeScript 6+. See https://tsup.egoist.dev/ (--experimental-dts).
  experimentalDts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  outDir: "dist"
});
