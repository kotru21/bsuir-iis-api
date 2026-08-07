---
"bsuir-iis-api": major
---

**Breaking: Node.js 20 support dropped** (EOL). `engines` now requires **Node >=22.18.0**; CI runs the full pipeline on Node 22, 24 (active LTS), and 26 (current, early-warning).

**Breaking: deprecated last-update helpers removed.** `client.schedule.getLastUpdateByGroup()` and `client.schedule.getLastUpdateByEmployee()` are gone together with the `ApiDateResponse` type, as announced in 1.x (`@deprecated`, removal in 2.0). The upstream `/last-update-date/*` routes are legacy and unmaintained on the IIS side. There is no SDK replacement for freshness — use your own cache TTL / re-fetch policy.

**Breaking: subgroup filters include shared lessons.** `filterLessons`, `get*Filtered`, and `get*BySubgroup*` treat `numSubgroup === 0` as shared (included for every positive subgroup). Passing `subgroup: 0` / non-positive values is still rejected.

**Breaking: low-level HTTP types removed from the public surface.** `RequestOptions`, `QueryParams`, `QueryValue`, and `RequestMethod` are no longer exported from the package root. Use `ReadOptions` / `ScheduleReadOptions` / hook context types instead; `RequestCacheMode` remains public for per-call `cache` options.
