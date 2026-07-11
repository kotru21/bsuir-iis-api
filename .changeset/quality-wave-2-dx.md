---
"bsuir-iis-api": major
---

Simplify subgroup schedule API and improve validateResponses DX.

**Breaking:** `get*BySubgroup` no longer accepts `raw` / `rawEnvelope`. Use `get*BySubgroupRaw` / `get*BySubgroupEnvelope`. `getGroupEnvelope` / `getEmployeeEnvelope` renamed to `get*BySubgroupEnvelope`. See README migration notes.

Also: `@deprecated` last-update helpers (behavior unchanged); `createBsuirClient.strict()` enables `validateResponses` (default remains `false`).
