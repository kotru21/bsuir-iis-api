---
"bsuir-iis-api": patch
---

Build pipeline migrated from tsup to tsdown (rolldown-based). The published artifact layout is unchanged (`dist/index.js` + `dist/index.d.ts`, ESM, es2022 target) and the public API surface is identical (verified by API Extractor report).
