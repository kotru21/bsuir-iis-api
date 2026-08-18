---
"bsuir-iis-api": patch
---

When current-term `schedules` is empty, `normalizeSchedule` / `getGroup` / `getEmployee` flatten `nextSchedules` by default so between-term IIS payloads are not an empty timetable. Pass `{ includeNextSchedules: false }` to keep current-term-only.
