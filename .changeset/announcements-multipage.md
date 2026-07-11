---
"bsuir-iis-api": patch
---

Fetch all Spring Data pages for `announcements.byEmployee` / `byDepartment` (safety cap: 50 pages) so callers no longer silently lose items beyond the first page.
