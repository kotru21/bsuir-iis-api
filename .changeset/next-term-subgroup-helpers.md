---
"bsuir-iis-api": patch
---

Subgroup helpers (`get*BySubgroup`, `get*BySubgroupRaw`, `get*BySubgroupEnvelope`) and `getLessonsForWeek` now follow the same next-term rule as `getGroup` / `getEmployee`: when current-term `schedules` is empty, `nextSchedules` lessons are included instead of returning an empty result.
