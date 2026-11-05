---
"bsuir-iis-api": major
---

One schedule entry point, DTO schemas bound to the types, and honest nullable fields. See "3.0.0" in the README migration notes for the method mapping.

- **`schedule.get(target, options?)` / `schedule.getRaw(target, options?)` replace 14 methods** (`getGroup`, `getEmployee`, `get*Raw`, `get*Filtered`, `get*Exams`, `get*BySubgroup`, `get*BySubgroupRaw`, `get*BySubgroupEnvelope`). `target` is `{ group }` or `{ employee }`. The new `filter` option (any `ScheduleFilterOptions`, also on `normalizeSchedule`) narrows **every** view of the normalized result, so `get(target, { filter: { subgroup: 2 } })` is a complete subgroup schedule that `buildScheduleDays` accepts directly. `getCurrentWeek()` is unchanged; `ScheduleTarget` is exported.
- **Strict mode validates every DTO field** — catalog items, nested lesson employees / student groups, `employeeDto` / `studentGroupDto` — using one runtime schema per DTO that the compiler checks against the exported interface field by field. Types and validators can no longer drift apart.
- **Nullable fields found on live IIS payloads:** `Employee.middleName`, `EmployeeCatalogItem.middleName` / `rank`, `StudentGroupCatalogItem.course`, `Auditory.note` / `department` are now `… | null`; strict mode accepts the real data.
- **Employees whose `urlId` contains an apostrophe** (`a-kuz'mich`, transliterated soft sign) are accepted; they were rejected with `BsuirValidationError`, making their schedules and announcements unreachable.
