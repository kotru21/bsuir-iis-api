---
"bsuir-iis-api": patch
---

Expand opt-in live contract coverage into domain suites under `test/integration/live/`.

- Split catalogs, schedule, announcements, and strict/helpers canaries out of the old monolith.
- Soft-skip schedule-dependent suites when IIS probes find no working group/employee.
- Docs and `test:live` entrypoint updated; no public API change.
