# Quality Wave 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Wave 0 from the quality-improvements design: shared Spring page unwrap helper, wire it into announcements (and defensively into catalog `listAll`), and strengthen live-contract canaries for announcements pagination + catalog array shapes.

**Architecture:** Extract pure `unwrapSpringPageContent(payload)` next to response validators. Announcements and `createListModule` call it after optional `validateResponses` asserts. Live contracts assert arrays and, for announcements, detect paginated envelopes via a raw `fetch` probe so IIS drift is visible in weekly CI.

**Tech Stack:** TypeScript (strict), Vitest, existing `createBsuirClient` / `mockFetchSequence` / `BSUIR_LIVE_TESTS=1` live contracts, Changesets.

**Spec:** `docs/superpowers/specs/2026-07-11-quality-improvements-design.md` (Wave 0: P1-4, P0-2, P0-3).

**Out of scope (separate plans later):**

- Wave 1 — P0-1 announcements multi-page fetch (needs mini-spec for default vs opt-in)
- Wave 2 — P1-1 / P1-2 / P1-3 / P3-4 schedule DX major + deprecations
- Wave 3 — P2-1 / P2-2 / P2-3 file splits
- Later / Don't items

---

## File map

| File                                                     | Responsibility                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Create: `src/client/springPage.ts`                       | Pure unwrap of Spring Data `{ content: T[] }` vs plain `T[]`             |
| Modify: `src/modules/announcements.ts`                   | Replace local `normalizeAnnouncementList` with `unwrapSpringPageContent` |
| Modify: `src/modules/createListModule.ts`                | After fetch, unwrap page envelope before casting to `T[]`                |
| Create: `test/client/springPage.test.ts`                 | Unit tests for unwrap helper                                             |
| Modify: `test/modules/announcements.test.ts`             | Still pass (behavior unchanged)                                          |
| Modify: `test/modules/catalogs.test.ts`                  | Add envelope-unwrap case for `listAll`                                   |
| Modify: `test/client/validateResponses-contract.test.ts` | Catalog envelope + `validateResponses` behavior                          |
| Modify: `test/integration/live-api.contract.test.ts`     | Announcements pagination probe + catalog array canaries                  |
| Create: `.changeset/quality-wave-0-spring-page.md`       | Patch changeset                                                          |

**Public API:** No new exports required for Wave 0 (helper stays internal). Behavior change: catalog `listAll` becomes resilient to `{ content: [...] }` the same way announcements already are — non-breaking for plain arrays.

---

### Task 1: Unit tests for `unwrapSpringPageContent`

**Files:**

- Create: `test/client/springPage.test.ts`
- Create: `src/client/springPage.ts`

- [x] **Step 1: Write the failing tests**

Create `test/client/springPage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { unwrapSpringPageContent } from "../../src/client/springPage";

describe("unwrapSpringPageContent", () => {
  it("returns plain arrays unchanged", () => {
    const items = [{ id: 1 }];
    expect(unwrapSpringPageContent(items)).toBe(items);
  });

  it("returns content array from Spring page envelope", () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(
      unwrapSpringPageContent({
        content: items,
        totalElements: 2,
        totalPages: 1,
        last: true
      })
    ).toBe(items);
  });

  it("returns original payload when object has no content array", () => {
    const payload = { totalElements: 0 };
    expect(unwrapSpringPageContent(payload)).toBe(payload);
  });

  it("returns non-object payloads unchanged", () => {
    expect(unwrapSpringPageContent(null)).toBe(null);
    expect(unwrapSpringPageContent("x")).toBe("x");
    expect(unwrapSpringPageContent(1)).toBe(1);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run test/client/springPage.test.ts
```

Expected: FAIL — cannot resolve `../../src/client/springPage` (module not found).

- [x] **Step 3: Implement minimal helper**

Create `src/client/springPage.ts`:

```ts
/**
 * IIS list endpoints may return a plain JSON array (legacy) or a Spring Data
 * page envelope `{ content: T[], pageable?, totalElements?, ... }`.
 * Returns the item array when present; otherwise returns the payload unchanged
 * so callers/validators can still reject unexpected shapes.
 */
export function unwrapSpringPageContent(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload === "object" && payload !== null) {
    const content = (payload as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      return content;
    }
  }

  return payload;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run test/client/springPage.test.ts
```

Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/client/springPage.ts test/client/springPage.test.ts
git commit -m "$(cat <<'EOF'
feat: add Spring page content unwrap helper

EOF
)"
```

---

### Task 2: Wire helper into announcements module

**Files:**

- Modify: `src/modules/announcements.ts`
- Test: `test/modules/announcements.test.ts` (existing — must stay green)
- Test: `test/client/validateResponses-contract.test.ts` (existing)

- [x] **Step 1: Write a regression test that imports behavior stays identical**

Existing tests already cover unwrap. Add one focused test at the end of `test/modules/announcements.test.ts`:

```ts
it("unwraps empty content array from paginated envelope", async () => {
  const body = {
    content: [],
    totalElements: 0,
    totalPages: 0,
    last: true
  };
  const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
  const client = createBsuirClient({ fetch: fetchImpl });
  await expect(client.announcements.byDepartment(1)).resolves.toEqual([]);
});
```

- [x] **Step 2: Run the new test (should pass even before refactor if local normalize exists)**

Run:

```bash
npx vitest run test/modules/announcements.test.ts -t "unwraps empty content"
```

Expected: PASS with current `normalizeAnnouncementList`.

- [x] **Step 3: Replace local normalize with shared helper**

In `src/modules/announcements.ts`:

1. Add import:

```ts
import { unwrapSpringPageContent } from "../client/springPage";
```

2. Delete the entire `normalizeAnnouncementList` function.

3. Change the success return in `requestAnnouncementList` from:

```ts
return normalizeAnnouncementList(payload) as Announcement[];
```

to:

```ts
return unwrapSpringPageContent(payload) as Announcement[];
```

Keep `assertAnnouncementListResponse` on the **raw** payload before unwrap (validators already accept array or `{ content: [...] }`).

- [x] **Step 4: Run announcements + validator contract tests**

Run:

```bash
npx vitest run test/modules/announcements.test.ts test/client/validateResponses-contract.test.ts test/client/responseValidators.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/announcements.ts test/modules/announcements.test.ts
git commit -m "$(cat <<'EOF'
refactor: use shared Spring page unwrap in announcements

EOF
)"
```

---

### Task 3: Defensive unwrap in catalog `createListModule` (P0-3)

**Files:**

- Modify: `src/modules/createListModule.ts`
- Modify: `test/modules/catalogs.test.ts`
- Modify: `test/client/validateResponses-contract.test.ts`

- [x] **Step 1: Write failing catalog envelope tests**

Append to `test/modules/catalogs.test.ts`:

```ts
it("unwraps Spring page envelope for listAll", async () => {
  const groups = [{ name: "053503", id: 1 }];
  const fetchImpl = mockFetchSequence([
    createJsonResponse({
      body: {
        content: groups,
        totalElements: 1,
        totalPages: 1,
        last: true
      }
    })
  ]);
  const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
  await expect(client.groups.listAll()).resolves.toEqual(groups);
});

it("unwraps Spring page envelope when validateResponses is true", async () => {
  const departments = [{ id: 20_027, name: "ПОИТ", abbrev: "ПОИТ" }];
  const fetchImpl = mockFetchSequence([
    createJsonResponse({
      body: { content: departments, totalElements: 1, last: true }
    })
  ]);
  const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
  await expect(client.departments.listAll()).resolves.toEqual(departments);
});
```

Also append to `test/client/validateResponses-contract.test.ts`:

```ts
it("catalog listAll unwraps paginated envelope when validateResponses is true", async () => {
  const items = [{ id: 1, name: "x" }];
  const fetchImpl = mockFetchSequence([
    createJsonResponse({ body: { content: items, totalElements: 1 } })
  ]);
  const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
  await expect(client.groups.listAll()).resolves.toEqual(items);
});
```

- [x] **Step 2: Run failing tests**

Run:

```bash
npx vitest run test/modules/catalogs.test.ts test/client/validateResponses-contract.test.ts
```

Expected: FAIL on new envelope tests — with `validateResponses: true`, `assertArrayResponse` throws on `{ content: [...] }`; with `false`, result is the object not the array.

- [x] **Step 3: Update `createListModule` and array assertion path**

Replace `src/modules/createListModule.ts` with:

```ts
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import { unwrapSpringPageContent } from "../client/springPage";
import type { InternalClientConfig } from "../client/types";
import type { ReadOptions } from "./types";

export interface ListModule<T> {
  listAll(options?: ReadOptions): Promise<T[]>;
}

/**
 * Creates a simple catalog-like module exposing `listAll()` for a fixed endpoint.
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string
): ListModule<T> {
  return {
    /**
     * Returns all items from the configured endpoint.
     *
     * IIS may return a plain array or a Spring Data page `{ content: [...] }`;
     * the SDK always resolves to `T[]` (first page only if paginated).
     */
    async listAll(options: ReadOptions = {}): Promise<T[]> {
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses
          ? (value) => {
              const unwrapped = unwrapSpringPageContent(value);
              assertArrayResponse(unwrapped, endpoint);
            }
          : undefined
      });
      return unwrapSpringPageContent(payload) as T[];
    }
  };
}
```

Note: validate on **unwrapped** value so `{ content: [...] }` is accepted; plain non-arrays still fail.

- [x] **Step 4: Run catalog-related tests**

Run:

```bash
npx vitest run test/modules/catalogs.test.ts test/client/validateResponses-contract.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/modules/createListModule.ts test/modules/catalogs.test.ts test/client/validateResponses-contract.test.ts
git commit -m "$(cat <<'EOF'
fix: unwrap Spring page envelopes in catalog listAll

EOF
)"
```

---

### Task 4: Live-contract canaries (P0-2 + P0-3)

**Files:**

- Modify: `test/integration/live-api.contract.test.ts`

- [x] **Step 1: Add live canaries for catalog shapes and announcement pagination probe**

Keep existing tests. After the catalogs shape checks in `"loads core catalogs..."`, strengthen with:

```ts
for (const [label, value] of [
  ["groups", groups],
  ["employees", employees],
  ["departments", departments],
  ["faculties", faculties],
  ["specialities", specialities],
  ["auditories", auditories]
] as const) {
  expect(Array.isArray(value), `${label} must be an array (not a page object)`).toBe(true);
  expect(value, `${label} must not look like a raw Spring page`).not.toHaveProperty("content");
}
```

Add a new live test (inside `describeLive`):

```ts
it("announcements endpoints return array or Spring page; SDK yields array", async () => {
  const baseUrl = "https://iis.bsuir.by/api/v1";
  const rawEmployeeUrl = `${baseUrl}/announcements/employees?url-id=s-nesterenkov`;

  const rawResponse = await fetch(rawEmployeeUrl, {
    headers: { Accept: "application/json" }
  });
  expect(rawResponse.ok || rawResponse.status === 404).toBe(true);

  if (rawResponse.ok) {
    const rawPayload: unknown = await rawResponse.json();
    const isArray = Array.isArray(rawPayload);
    const isPage =
      typeof rawPayload === "object" &&
      rawPayload !== null &&
      Array.isArray((rawPayload as { content?: unknown }).content);
    expect(isArray || isPage).toBe(true);

    if (isPage) {
      const page = rawPayload as {
        content: unknown[];
        totalPages?: number;
        totalElements?: number;
        last?: boolean;
      };
      expect(page.content).toEqual(expect.any(Array));
      if (typeof page.totalPages === "number") {
        expect(page.totalPages).toBeGreaterThanOrEqual(1);
      }
      // Wave 1 will fetch remaining pages when totalPages > 1 / last === false.
      if (page.last === false || (typeof page.totalPages === "number" && page.totalPages > 1)) {
        expect(page.content.length).toBeGreaterThan(0);
      }
    }
  }

  const viaSdk = await client.announcements.byEmployee("s-nesterenkov");
  expect(Array.isArray(viaSdk)).toBe(true);
}, 60_000);
```

- [x] **Step 2: Run unit suite (live skipped without env)**

Run:

```bash
npx vitest run test/integration/live-api.contract.test.ts
```

Expected: All tests skipped (or PASS skip) when `BSUIR_LIVE_TESTS` is unset — suite loads without error.

- [x] **Step 3: Run live contracts when network allowed**

Run (PowerShell):

```powershell
$env:BSUIR_LIVE_TESTS="1"; npx vitest run test/integration/live-api.contract.test.ts
```

Expected: PASS against real IIS. If catalog canary fails because `listAll` still returned a page object, Task 3 was incomplete — fix before continuing. If announcements raw probe fails shape assert, stop and update design (unexpected IIS shape).

- [x] **Step 4: Commit**

```bash
git add test/integration/live-api.contract.test.ts
git commit -m "$(cat <<'EOF'
test(live): canary announcements pagination and catalog array shapes

EOF
)"
```

---

### Task 5: Docs + changeset + full check

**Files:**

- Modify: `README.md` (Catalogs / Announcements notes)
- Create: `.changeset/quality-wave-0-spring-page.md`

- [x] **Step 1: Update README catalog note**

In `README.md`, under `### Catalogs`, after the bullet list, add:

```markdown
Catalog `listAll()` methods always resolve to arrays. If IIS returns a Spring Data page envelope (`{ content: [...] }`), the SDK unwraps `content` (first page only; same limitation as announcements until multi-page fetching lands).
```

Under Announcements pagination note, leave the first-page-only warning as-is (Wave 1).

- [x] **Step 2: Add changeset**

Create `.changeset/quality-wave-0-spring-page.md`:

```md
---
"bsuir-iis-api": patch
---

Make list endpoints resilient to Spring Data page envelopes.

- Add internal `unwrapSpringPageContent` helper for plain arrays vs `{ content: [...] }`.
- Use it in announcements and catalog `listAll` (first page only).
- Strengthen live-contract canaries for announcement pagination shapes and catalog arrays.
```

- [x] **Step 3: Run full verification**

Run:

```bash
npm run check:full
```

Expected: lint, typecheck, format, coverage all green.

Optional:

```bash
npm run api:report:check
```

Expected: PASS (no public API export changes).

- [x] **Step 4: Commit**

```bash
git add README.md .changeset/quality-wave-0-spring-page.md
git commit -m "$(cat <<'EOF'
docs: document catalog page unwrap; add Wave 0 changeset

EOF
)"
```

---

## Wave 0 done criteria

- [x] `unwrapSpringPageContent` covered by unit tests
- [x] Announcements use shared helper (no local duplicate)
- [x] Catalog `listAll` unwraps `{ content }` with and without `validateResponses`
- [x] Live canaries added; pass with `BSUIR_LIVE_TESTS=1` when run
- [x] Changeset + README updated
- [x] `npm run check:full` green

## Next plans (do not implement in this plan)

1. **Wave 1 mini-spec + plan** — P0-1 multi-page announcements (choose always-all vs opt-in; use `totalPages` / `last` from live canary).
2. **Wave 2 plan** — P3-4 migration template, P1-1 subgroup explicit methods (major), P1-2 deprecate last-update, P1-3 validateResponses DX.
3. **Wave 3 plan** — P2-3 / P2-1 / P2-2 internal splits.

---

## Spec coverage (self-review)

| Spec ID                         | Covered by                                 |
| ------------------------------- | ------------------------------------------ |
| P1-4                            | Tasks 1–2                                  |
| P0-3                            | Tasks 3–4 (defensive unwrap + live canary) |
| P0-2                            | Task 4                                     |
| P0-1 / P1-x / P2-x / P3 / Don't | Explicitly out of scope → later plans      |
