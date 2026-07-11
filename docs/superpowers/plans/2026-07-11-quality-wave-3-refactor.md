# Quality Wave 3 (internal refactor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behavior-preserving Wave 3 splits: scheduleApi group/employee factory, `requestJson` modules, `helpers/schedule` modules.

**Architecture:** Extract shared subject methods behind a factory; peel cache-key / private-headers / body-serialize / perform+retry out of `requestJson`; split schedule helpers into date-keys / current-next / build-days with a stable barrel.

**Tech Stack:** TypeScript (strict), Vitest, api-extractor, Changesets.

**Spec:** `docs/superpowers/specs/2026-07-11-quality-wave-3-refactor-design.md`

**Out of scope:** P2-4, P2-5, P3-\*; any public API or behavior changes.

---

## File map

| File                                            | Responsibility                                             |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Create: `src/modules/scheduleApiSubject.ts`     | Shared filtered / exams / subgroup methods for one subject |
| Modify: `src/modules/scheduleApi.ts`            | Wire group + employee through factory; keep interface      |
| Create: `src/client/http/requestCacheKey.ts`    | Cache/dedup request key                                    |
| Create: `src/client/http/privateHeaders.ts`     | Private header denylist                                    |
| Create: `src/client/http/serializeBody.ts`      | Body serialization                                         |
| Create: `src/client/http/performRequest.ts`     | Retry loop + hooks                                         |
| Modify: `src/client/http/requestJson.ts`        | Orchestrate cache/dedup + call perform                     |
| Create: `src/helpers/scheduleDateKeys.ts`       | Date keys + lessons-for-date family                        |
| Create: `src/helpers/scheduleCurrentNext.ts`    | Sort / current / next / InvalidLessonTimeHook              |
| Create: `src/helpers/scheduleBuildDays.ts`      | `buildScheduleDays`                                        |
| Replace body: `src/helpers/schedule.ts`         | Barrel re-exports                                          |
| Create: `.changeset/quality-wave-3-refactor.md` | Patch changeset                                            |

---

### Task 1: P2-3 — scheduleApi subject factory

**Files:**

- Create: `src/modules/scheduleApiSubject.ts`
- Modify: `src/modules/scheduleApi.ts`

- [ ] **Step 1: Add factory module**

```ts
// src/modules/scheduleApiSubject.ts
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import { assertPositiveInt } from "../utils/guards";
import { filterLessons } from "./scheduleFilter";
import type { ReadOptions } from "./types";

export interface ScheduleSubjectFetcher {
  getNormalized(id: string, options?: ReadOptions): Promise<NormalizedScheduleResponse>;
  getRaw(id: string, options?: ReadOptions): Promise<ScheduleResponse>;
}

export interface ScheduleSubjectMethods {
  getFiltered(
    id: string,
    filter: ScheduleFilterOptions,
    options?: ReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getExams(id: string, options?: ReadOptions): Promise<FlattenedScheduleItem[]>;
  getBySubgroup(
    id: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getBySubgroupRaw(id: string, subgroup: number, options?: ReadOptions): Promise<ScheduleItem[]>;
  getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<ScheduleResponse>;
}

export function filterRawSubgroupLessons(
  response: ScheduleResponse,
  subgroup: number
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const schedules = response.schedules ?? {};
  for (const dayItems of Object.values(schedules)) {
    for (const lesson of dayItems) {
      if (lesson.numSubgroup === subgroup) {
        items.push(structuredClone(lesson));
      }
    }
  }
  return items;
}

export function filterRawSubgroupEnvelope(
  response: ScheduleResponse,
  subgroup: number
): ScheduleResponse {
  const cloned = structuredClone(response);
  const schedules = cloned.schedules ?? {};
  for (const day of Object.keys(schedules) as (keyof typeof schedules)[]) {
    const items = schedules[day] ?? [];
    schedules[day] = items.filter((lesson) => lesson.numSubgroup === subgroup);
  }
  return cloned;
}

/**
 * Builds filtered / exams / subgroup helpers for one schedule subject (group or employee).
 */
export function createScheduleSubjectMethods(
  fetcher: ScheduleSubjectFetcher
): ScheduleSubjectMethods {
  async function getFiltered(
    id: string,
    filter: ScheduleFilterOptions,
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    const normalized = await fetcher.getNormalized(id, {
      signal: options.signal,
      cache: options.cache
    });
    return filterLessons(normalized, filter);
  }

  async function getExams(id: string, options: ReadOptions = {}): Promise<FlattenedScheduleItem[]> {
    return getFiltered(id, { source: "exams" }, options);
  }

  async function getBySubgroup(
    id: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    return getFiltered(id, { source: "schedules", subgroup }, options);
  }

  async function getBySubgroupRaw(
    id: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    return filterRawSubgroupLessons(raw, subgroup);
  }

  async function getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    return filterRawSubgroupEnvelope(raw, subgroup);
  }

  return {
    getFiltered,
    getExams,
    getBySubgroup,
    getBySubgroupRaw,
    getBySubgroupEnvelope
  };
}
```

- [ ] **Step 2: Wire factory in `scheduleApi.ts`**

Remove local `filterRawSubgroup*` and duplicated filtered/subgroup/exams bodies. After `getGroupRaw` / `getEmployeeRaw`:

```ts
const groupMethods = createScheduleSubjectMethods({
  getNormalized: getGroup,
  getRaw: getGroupRaw
});
const employeeMethods = createScheduleSubjectMethods({
  getNormalized: getEmployee,
  getRaw: getEmployeeRaw
});
```

Return object maps:

- `getGroupFiltered` → `groupMethods.getFiltered`
- `getGroupExams` → `groupMethods.getExams`
- `getGroupBySubgroup` → `groupMethods.getBySubgroup`
- `getGroupBySubgroupRaw` → `groupMethods.getBySubgroupRaw`
- `getGroupBySubgroupEnvelope` → `groupMethods.getBySubgroupEnvelope`
- (same for employee)

Preserve JSDoc on the interface methods; implementations may keep thin wrappers that only forward if needed for docs, or attach docs on the returned named properties.

- [ ] **Step 3: Run scheduleApi tests**

```bash
npx vitest run test/modules/scheduleApi.raw.test.ts test/modules/scheduleApi.newApi.test.ts test/modules/schedule.test.ts test/modules/scheduleApi.cacheValidation.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/scheduleApi.ts src/modules/scheduleApiSubject.ts
git commit -m "refactor: dedup scheduleApi group/employee via subject factory"
```

---

### Task 2: P2-1 — split `requestJson.ts`

**Files:**

- Create: `src/client/http/requestCacheKey.ts`
- Create: `src/client/http/privateHeaders.ts`
- Create: `src/client/http/serializeBody.ts`
- Create: `src/client/http/performRequest.ts`
- Modify: `src/client/http/requestJson.ts`

- [ ] **Step 1: Extract modules by moving existing functions verbatim**

`requestCacheKey.ts` — move `CACHE_KEY_HEADER_ALLOWLIST`, `normalizeHeadersForRequestKey`, `buildRequestKey` (export `buildRequestKey`).

`privateHeaders.ts` — move `PRIVATE_HEADER_DENYLIST`, `isPrivateHeader`, `hasPrivateHeaders` (export `hasPrivateHeaders`).

`serializeBody.ts` — move `isBodyInit`, `serializeRequestBody` (export `serializeRequestBody`).

`performRequest.ts` — export:

```ts
export interface PerformRequestParams<T> {
  config: Readonly<InternalClientConfig>;
  path: string;
  endpoint: string;
  method: RequestMethod;
  headers: Headers;
  body: BodyInit | undefined;
  options: RequestOptions;
  maxRetries: number;
  maxAttempts: number;
  onSuccessMeta: (meta: { hookCtx: RequestHookContext; durationMs: number }) => void;
}

export function baseHookContext(...): RequestHookContext; // export for requestJson cache-hit hooks

export async function performRequestWithRetry<T>(params: PerformRequestParams<T>): Promise<T>;
```

Move the for-loop body from current `performRequest` into `performRequestWithRetry`. Keep error/retry/hook behavior identical.

- [ ] **Step 2: Slim `requestJson.ts`**

Import the four modules. Keep cache/dedup orchestration and `runResponseValidator` / `requestAndMaybeCache` / in-flight map logic in `requestJson`. Call `performRequestWithRetry` instead of inline loop.

- [ ] **Step 3: Run HTTP tests**

```bash
npx vitest run test/client/http
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/client/http/
git commit -m "refactor: split requestJson into cache key, headers, body, perform"
```

---

### Task 3: P2-2 — split `helpers/schedule.ts`

**Files:**

- Create: `src/helpers/scheduleCurrentNext.ts`
- Create: `src/helpers/scheduleDateKeys.ts`
- Create: `src/helpers/scheduleBuildDays.ts`
- Replace: `src/helpers/schedule.ts` (barrel)

- [ ] **Step 1: Extract `scheduleCurrentNext.ts` first** (no deps on date keys)

Move: `InvalidLessonTimeHook`, time parse helpers, `sortLessonsByTime`, `getCurrentLesson`, `getNextLesson`, plus `toDateOrThrow` (shared — either export from date-keys and import, or keep a tiny shared `scheduleDateUtil`). Prefer putting `toDateOrThrow` in `scheduleDateKeys.ts` and importing it from current-next **after** date-keys exists; for first extract, include a private `toDateOrThrow` in current-next then dedupe when date-keys lands, **or** extract date util first.

Recommended order inside Task 3:

1. `scheduleDateKeys.ts` — constants `SUNDAY_LABEL` / `MS_PER_DAY`, ordinal/key/weekday helpers, `toDateOrThrow` (export for siblings), `getLessonsForDate`, `getTodayLessons`, `getTomorrowLessons`, `getLessonsForWeek`, `groupLessonsByDay`. Import `sortLessonsByTime` from `./scheduleCurrentNext` — so create current-next **before** date-keys, or use a third tiny file. Simplest dependency order:
   - `scheduleCurrentNext.ts` (includes local `toDateOrThrow` OR imports from dateKeys)
   - Avoid cycle: put `toDateOrThrow` + pure date helpers in `scheduleDateKeys.ts` without importing current-next; put time/current/next in `scheduleCurrentNext.ts` importing `toDateOrThrow` from dateKeys; put `getLessonsForDate` family in `scheduleDateKeys.ts` importing `sortLessonsByTime` from currentNext — **cycle**.

   **Break cycle:** keep pure date primitives in `scheduleDateKeys.ts`; put `getLessonsForDate` / today / tomorrow / week / `groupLessonsByDay` in `scheduleBuildDays.ts` together with `buildScheduleDays`, importing both dateKeys and currentNext. Then design’s “date keys” file is primitives only; “buildScheduleDays” file owns date-matching + builder.

   Adjusted map (still matches design intents):

   | File                     | Exports                                                                                                                     |
   | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
   | `scheduleDateKeys.ts`    | internal/shared date primitives; export `toDateKey`, `toDateOrThrow` if needed by siblings                                  |
   | `scheduleCurrentNext.ts` | `InvalidLessonTimeHook`, `sortLessonsByTime`, `getCurrentLesson`, `getNextLesson`                                           |
   | `scheduleBuildDays.ts`   | `getLessonsForDate`, `getTodayLessons`, `getTomorrowLessons`, `getLessonsForWeek`, `groupLessonsByDay`, `buildScheduleDays` |
   | `schedule.ts`            | re-export all public symbols                                                                                                |

- [ ] **Step 2: Replace `schedule.ts` with barrel**

```ts
export type { InvalidLessonTimeHook } from "./scheduleCurrentNext";
export { getCurrentLesson, getNextLesson, sortLessonsByTime } from "./scheduleCurrentNext";
export {
  buildScheduleDays,
  getLessonsForDate,
  getLessonsForWeek,
  getTodayLessons,
  getTomorrowLessons,
  groupLessonsByDay
} from "./scheduleBuildDays";
```

- [ ] **Step 3: Run helper tests**

```bash
npx vitest run test/modules/scheduleHelpers.test.ts test/modules/scheduleHelpers.extended.test.ts test/helpers/scheduleFormat.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/helpers/
git commit -m "refactor: split helpers/schedule into date keys, current-next, build days"
```

---

### Task 4: Changeset, docs, full check, PR

**Files:**

- Create: `.changeset/quality-wave-3-refactor.md`
- Docs already added under `docs/superpowers/specs|plans/`

- [ ] **Step 1: Add patch changeset**

```md
---
"bsuir-iis-api": patch
---

Internal refactors: shared scheduleApi subject factory; split requestJson and schedule helpers into focused modules. No public API or behavior changes.
```

- [ ] **Step 2: Full verification**

```bash
npm run check:full
npm run api:report:check
```

Expected: both PASS; api report unchanged.

- [ ] **Step 3: Commit docs + changeset**

```bash
git add docs/superpowers/specs/2026-07-11-quality-wave-3-refactor-design.md docs/superpowers/plans/2026-07-11-quality-wave-3-refactor.md .changeset/quality-wave-3-refactor.md
git commit -m "chore: Wave 3 refactor docs and patch changeset"
```

- [ ] **Step 4: Push PR, squash-merge, version, publish**

```bash
git push -u origin HEAD
gh pr create --title "refactor: Wave 3 quality splits (scheduleApi, requestJson, schedule helpers)" --body "..."
gh pr merge --squash
git checkout main && git pull
npx changeset version
git add -A && git commit -m "chore: consume quality-wave-3 changeset"
git push
```

Confirm GH Actions publish of **1.0.1**.

---

## Self-review

1. **Spec coverage:** P2-3 (Task 1), P2-1 (Task 2), P2-2 (Task 3), release (Task 4) — covered.
2. **Placeholders:** none; cycle break for schedule helpers documented.
3. **Public API:** barrels preserve `helpers/schedule` and `requestJson` entrypoints; `ScheduleModule` names unchanged.
