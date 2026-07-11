# Announcements Multi-Page Fetching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close P0-1 silent data loss by fetching all Spring Data announcement pages and returning a concatenated `Announcement[]`, with a hard 50-page safety cap.

**Architecture:** Extend `requestAnnouncementList` in `src/modules/announcements.ts` to detect multi-page Spring envelopes, then request subsequent pages with the same entity query plus `page` / `size` (verified against live IIS). Reuse `unwrapSpringPageContent`. No new public options — patch-level bug fix.

**Tech Stack:** TypeScript (strict), Vitest, `mockFetchSequence` / `createJsonResponse`, Changesets, live contract under `BSUIR_LIVE_TESTS=1`.

**Spec:** `docs/superpowers/specs/2026-07-11-announcements-multipage-design.md`

---

## File map

| File                                                 | Responsibility                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Modify: `src/modules/announcements.ts`               | Fetch-all pagination loop, `MAX_ANNOUNCEMENT_PAGES`, cap error              |
| Modify: `src/client/springPage.ts`                   | Optional tiny helpers for page meta (keep unwrap; add `readSpringPageMeta`) |
| Modify: `test/client/springPage.test.ts`             | Tests for page-meta helper                                                  |
| Modify: `test/modules/announcements.test.ts`         | Multi-page, cap, query-param, treat404 regression tests                     |
| Modify: `test/integration/live-api.contract.test.ts` | Probe `page`/`size`; assert SDK length vs `totalElements`                   |
| Modify: `README.md`                                  | Pagination note: fetch-all + 50-page cap                                    |
| Create: `.changeset/announcements-multipage.md`      | Patch changeset                                                             |
| Docs: mini-spec + this plan                          | Already created under `docs/superpowers/`                                   |

**Public API:** No new exports. Return type stays `Announcement[]`. Semver: **patch**.

---

### Task 1: Spring page meta helper (TDD)

**Files:**

- Modify: `src/client/springPage.ts`
- Modify: `test/client/springPage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/client/springPage.test.ts`:

```typescript
import { readSpringPageMeta, unwrapSpringPageContent } from "../../src/client/springPage";

describe("readSpringPageMeta", () => {
  it("returns null for plain arrays", () => {
    expect(readSpringPageMeta([{ id: 1 }])).toBeNull();
  });

  it("reads totalPages, last, pageNumber, and pageSize from a Spring page", () => {
    expect(
      readSpringPageMeta({
        content: [{ id: 1 }],
        totalPages: 3,
        last: false,
        number: 0,
        size: 20,
        pageable: { pageNumber: 0, pageSize: 20 }
      })
    ).toEqual({
      totalPages: 3,
      last: false,
      pageNumber: 0,
      pageSize: 20
    });
  });

  it("falls back to size/number when pageable is missing", () => {
    expect(
      readSpringPageMeta({
        content: [],
        totalPages: 1,
        last: true,
        number: 0,
        size: 10
      })
    ).toEqual({
      totalPages: 1,
      last: true,
      pageNumber: 0,
      pageSize: 10
    });
  });

  it("returns null when content is not an array", () => {
    expect(readSpringPageMeta({ content: "nope", totalPages: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/client/springPage.test.ts -t "readSpringPageMeta"`

Expected: FAIL — `readSpringPageMeta` is not exported / not defined.

- [ ] **Step 3: Implement `readSpringPageMeta`**

In `src/client/springPage.ts`, add:

```typescript
export interface SpringPageMeta {
  totalPages: number | undefined;
  last: boolean | undefined;
  pageNumber: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Reads Spring Data pagination fields when `payload` is a page envelope
 * with an array `content`. Returns `null` for plain arrays / non-pages.
 */
export function readSpringPageMeta(payload: unknown): SpringPageMeta | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.content)) {
    return null;
  }

  const pageable =
    typeof record.pageable === "object" && record.pageable !== null
      ? (record.pageable as Record<string, unknown>)
      : undefined;

  const pageNumberRaw = pageable?.pageNumber ?? record.number;
  const pageSizeRaw = pageable?.pageSize ?? record.size;

  return {
    totalPages: typeof record.totalPages === "number" ? record.totalPages : undefined,
    last: typeof record.last === "boolean" ? record.last : undefined,
    pageNumber: typeof pageNumberRaw === "number" ? pageNumberRaw : 0,
    pageSize: typeof pageSizeRaw === "number" && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE
  };
}
```

Keep existing `unwrapSpringPageContent` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/client/springPage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/springPage.ts test/client/springPage.test.ts
git commit -m "$(cat <<'EOF'
feat: add Spring page meta reader for pagination

EOF
)"
```

---

### Task 2: Failing multi-page announcement tests

**Files:**

- Modify: `test/modules/announcements.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/modules/announcements.test.ts`:

```typescript
it("fetches all pages and concatenates announcement content", async () => {
  const page0 = {
    content: [{ id: 1 }, { id: 2 }],
    pageable: { pageNumber: 0, pageSize: 2 },
    totalElements: 5,
    totalPages: 3,
    last: false,
    size: 2,
    number: 0
  };
  const page1 = {
    content: [{ id: 3 }, { id: 4 }],
    pageable: { pageNumber: 1, pageSize: 2 },
    totalElements: 5,
    totalPages: 3,
    last: false,
    size: 2,
    number: 1
  };
  const page2 = {
    content: [{ id: 5 }],
    pageable: { pageNumber: 2, pageSize: 2 },
    totalElements: 5,
    totalPages: 3,
    last: true,
    size: 2,
    number: 2
  };
  const fetchImpl = mockFetchSequence([
    createJsonResponse({ body: page0 }),
    createJsonResponse({ body: page1 }),
    createJsonResponse({ body: page2 })
  ]);
  const client = createBsuirClient({ fetch: fetchImpl });
  const result = await client.announcements.byEmployee("v-petrov");
  expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  const secondUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]);
  const thirdUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[2]?.[0]);
  expect(secondUrl).toContain("page=1");
  expect(secondUrl).toContain("size=2");
  expect(secondUrl).toContain("url-id=v-petrov");
  expect(thirdUrl).toContain("page=2");
  expect(thirdUrl).toContain("size=2");
});

it("does not request further pages when totalPages is 1", async () => {
  const body = {
    content: [{ id: 1 }],
    pageable: { pageNumber: 0, pageSize: 20 },
    totalElements: 1,
    totalPages: 1,
    last: true
  };
  const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
  const client = createBsuirClient({ fetch: fetchImpl });
  await expect(client.announcements.byEmployee("v-petrov")).resolves.toEqual([{ id: 1 }]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("throws BsuirConfigurationError when totalPages exceeds safety cap", async () => {
  const { BsuirConfigurationError } = await import("../../src/client/errors");
  const body = {
    content: [{ id: 1 }],
    pageable: { pageNumber: 0, pageSize: 20 },
    totalElements: 2000,
    totalPages: 51,
    last: false
  };
  const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
  const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
  await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(
    BsuirConfigurationError
  );
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("keeps treat404AsEmpty on the first request only", async () => {
  const page0 = {
    content: [{ id: 1 }],
    pageable: { pageNumber: 0, pageSize: 1 },
    totalElements: 2,
    totalPages: 2,
    last: false,
    size: 1,
    number: 0
  };
  const fetchImpl = mockFetchSequence([
    createJsonResponse({ body: page0 }),
    createJsonResponse({ status: 404, body: { message: "not found" } })
  ]);
  const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
  await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(BsuirApiError);
});
```

Also add at top of file if missing: `import` already has `vi` and `BsuirApiError`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/modules/announcements.test.ts -t "fetches all pages|safety cap|treat404AsEmpty on the first"`

Expected: FAIL — only first page returned / no throw on cap / 404 mapped to `[]`.

- [ ] **Step 3: Commit failing tests (optional red commit) or proceed to Task 3**

Prefer implementing next without a red-only commit if the branch is private; either is fine. Recommended:

```bash
git add test/modules/announcements.test.ts
git commit -m "$(cat <<'EOF'
test: cover announcements multi-page fetching

EOF
)"
```

---

### Task 3: Implement multi-page fetch in announcements module

**Files:**

- Modify: `src/modules/announcements.ts`

- [ ] **Step 1: Implement pagination loop**

Replace `requestAnnouncementList` logic as follows (keep `endpointMatchesPath` and public method signatures):

```typescript
import { BsuirApiError, BsuirConfigurationError } from "../client/errors";
import { requestJson } from "../client/http";
import { assertAnnouncementListResponse } from "../client/responseValidators";
import { readSpringPageMeta, unwrapSpringPageContent } from "../client/springPage";
import type { InternalClientConfig } from "../client/types";
import type { Announcement } from "../types/announcement";
import { assertEmployeeUrlId, assertPositiveInt } from "../utils/guards";
import type { ReadOptions } from "./types";

/** Hard safety cap on Spring pages fetched for one announcements call. */
export const MAX_ANNOUNCEMENT_PAGES = 50;

// ... AnnouncementReadOptions + endpointMatchesPath unchanged ...

function hasMoreAnnouncementPages(
  meta: NonNullable<ReturnType<typeof readSpringPageMeta>>,
  nextPage: number
): boolean {
  if (meta.last === true) {
    return false;
  }
  if (typeof meta.totalPages === "number") {
    return nextPage < meta.totalPages;
  }
  return meta.last === false;
}

async function requestAnnouncementList(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: AnnouncementReadOptions & { query: Record<string, string | number> }
): Promise<Announcement[]> {
  const treat404AsEmpty = options.treat404AsEmpty ?? true;
  const { query: baseQuery, ...readOptions } = options;

  const fetchPage = async (query: Record<string, string | number>): Promise<unknown> => {
    return requestJson<unknown>(config, path, {
      ...readOptions,
      query,
      responseValidator: config.validateResponses
        ? (value) => {
            assertAnnouncementListResponse(value, path);
          }
        : undefined
    });
  };

  try {
    const firstPayload = await fetchPage(baseQuery);
    const firstMeta = readSpringPageMeta(firstPayload);
    const items = [...(unwrapSpringPageContent(firstPayload) as Announcement[])];

    if (!firstMeta) {
      return items;
    }

    if (typeof firstMeta.totalPages === "number" && firstMeta.totalPages > MAX_ANNOUNCEMENT_PAGES) {
      throw new BsuirConfigurationError(
        `Announcements pagination exceeded safety cap of ${MAX_ANNOUNCEMENT_PAGES} pages (totalPages=${firstMeta.totalPages})`
      );
    }

    let pageNumber = firstMeta.pageNumber;
    let meta = firstMeta;

    while (hasMoreAnnouncementPages(meta, pageNumber + 1)) {
      const nextPage = pageNumber + 1;
      if (nextPage >= MAX_ANNOUNCEMENT_PAGES) {
        throw new BsuirConfigurationError(
          `Announcements pagination exceeded safety cap of ${MAX_ANNOUNCEMENT_PAGES} pages`
        );
      }

      const pagePayload = await fetchPage({
        ...baseQuery,
        page: nextPage,
        size: firstMeta.pageSize
      });
      const pageMeta = readSpringPageMeta(pagePayload);
      items.push(...(unwrapSpringPageContent(pagePayload) as Announcement[]));

      if (!pageMeta) {
        break;
      }
      pageNumber = pageMeta.pageNumber;
      meta = pageMeta;
    }

    return items;
  } catch (error) {
    if (
      treat404AsEmpty &&
      error instanceof BsuirApiError &&
      error.status === 404 &&
      endpointMatchesPath(error.endpoint, path)
    ) {
      // Only the initial request uses baseQuery without page=; subsequent page
      // URLs also end with the same path, so restrict empty-mapping to requests
      // that have not yet produced any items by checking the error endpoint query.
      const endpointUrl = error.endpoint;
      const hasPageParam = /[?&]page=/.test(endpointUrl);
      if (!hasPageParam) {
        return [];
      }
    }
    throw error;
  }
}
```

Update JSDoc on `byEmployee` / `byDepartment` / `requestAnnouncementList` to say all pages are fetched (capped at 50).

**Important:** Do **not** export `MAX_ANNOUNCEMENT_PAGES` from `src/index.ts` (internal constant; export from module file is fine for tests if needed, or keep unexported and assert via error message only). Prefer **not** exporting from the package public API — use `const MAX_ANNOUNCEMENT_PAGES = 50` without `export`, and test via thrown message / behavior.

- [ ] **Step 2: Run announcement unit tests**

Run: `npx vitest run test/modules/announcements.test.ts test/client/validateResponses-contract.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/announcements.ts test/modules/announcements.test.ts
git commit -m "$(cat <<'EOF'
fix: fetch all announcement pages from IIS

EOF
)"
```

---

### Task 4: README, live canary, changeset

**Files:**

- Modify: `README.md`
- Modify: `test/integration/live-api.contract.test.ts`
- Create: `.changeset/announcements-multipage.md`

- [ ] **Step 1: Update README pagination note**

Replace the announcements pagination paragraph with:

```markdown
**Pagination note:** IIS serves announcements as Spring Data pages (default `size` 20) using `page` / `size` query params. The SDK fetches **all pages** and returns the concatenated `Announcement[]`. If IIS reports more than **50** pages, the SDK throws `BsuirConfigurationError` (safety cap). Catalog `listAll()` still unwraps the first page only.
```

Also update the catalog sentence that says “same limitation as announcements until multi-page fetching lands” — catalogs remain first-page-only; remove the “until … lands” clause for announcements.

In Errors section, extend `BsuirConfigurationError` bullet:

```markdown
- `BsuirConfigurationError` when the runtime has no `fetch` and none was passed to `createBsuirClient({ fetch })`, or when announcements pagination exceeds the 50-page safety cap
```

- [ ] **Step 2: Strengthen live canary**

In `test/integration/live-api.contract.test.ts`, update the announcements pagination test to:

1. Probe `?url-id=s-nesterenkov&page=0&size=5` and `page=1&size=5` — assert page shapes / `last` flags.
2. Keep default SDK `byEmployee` call; when the default raw envelope has `totalElements`, assert `viaSdk.length === totalElements`.

Example addition inside the existing test (after raw default probe):

```typescript
const pagedUrl = `${baseUrl}/announcements/employees?url-id=s-nesterenkov&page=0&size=5`;
const pagedResponse = await fetch(pagedUrl, { headers: { Accept: "application/json" } });
if (pagedResponse.ok) {
  const pagedPayload: unknown = await pagedResponse.json();
  if (
    typeof pagedPayload === "object" &&
    pagedPayload !== null &&
    Array.isArray((pagedPayload as { content?: unknown }).content)
  ) {
    const page = pagedPayload as {
      content: unknown[];
      totalPages?: number;
      totalElements?: number;
      last?: boolean;
    };
    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.length).toBeLessThanOrEqual(5);
    if (typeof page.totalPages === "number" && page.totalPages > 1) {
      expect(page.last).toBe(false);
      const page1Url = `${baseUrl}/announcements/employees?url-id=s-nesterenkov&page=1&size=5`;
      const page1Response = await fetch(page1Url, {
        headers: { Accept: "application/json" }
      });
      expect(page1Response.ok).toBe(true);
      const page1Payload: unknown = await page1Response.json();
      expect(Array.isArray((page1Payload as { content?: unknown }).content)).toBe(true);
    }
  }
}

const viaSdk = await client.announcements.byEmployee("s-nesterenkov");
expect(Array.isArray(viaSdk)).toBe(true);
if (rawResponse.ok) {
  const rawPayload: unknown = await rawResponse
    .clone()
    .json()
    .catch(() => null);
  // Prefer totalElements captured earlier from the first json() call — see Step notes.
}
```

**Implementation note:** The current test already calls `rawResponse.json()` once. Capture `totalElements` in a `let` during the first parse, then after `viaSdk` assert:

```typescript
if (typeof capturedTotalElements === "number") {
  expect(viaSdk.length).toBe(capturedTotalElements);
}
```

Remove the obsolete “Wave 1 will fetch remaining pages…” comment.

- [ ] **Step 3: Add changeset**

Create `.changeset/announcements-multipage.md`:

```markdown
---
"bsuir-iis-api": patch
---

Fetch all Spring Data pages for `announcements.byEmployee` / `byDepartment` (safety cap: 50 pages) so callers no longer silently lose items beyond the first page.
```

- [ ] **Step 4: Run full checks**

Run: `npm run check:full`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md test/integration/live-api.contract.test.ts .changeset/announcements-multipage.md
git commit -m "$(cat <<'EOF'
docs: document announcements multi-page fetching

EOF
)"
```

---

### Task 5: Live tests, PR, merge, release

- [ ] **Step 1: Run live contract tests**

```bash
$env:BSUIR_LIVE_TESTS='1'; npm run test:live
```

Expected: PASS against real IIS.

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin HEAD
gh pr create --title "fix: fetch all announcement pages" --body "..."
```

- [ ] **Step 3: Squash-merge PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: On main — changeset version + push**

```bash
git checkout main
git pull origin main
npx changeset version
git add -A
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main
```

- [ ] **Step 5: Confirm npm publish**

Wait for GitHub Actions release workflow; verify `npm view bsuir-iis-api version` matches.

---

## Self-review (plan vs spec)

| Spec requirement                         | Task |
| ---------------------------------------- | ---- |
| Default fetch-all                        | 3    |
| Reuse `unwrapSpringPageContent`          | 3    |
| Detect via Spring fields                 | 1, 3 |
| Subsequent pages with `page` / `size`    | 2, 3 |
| Cap 50 + typed error                     | 2, 3 |
| `treat404AsEmpty` unchanged (first page) | 2, 3 |
| No new public opts; patch                | 4    |
| Unit tests + README + changeset          | 2, 4 |
| Live tests + release workflow            | 5    |

No TBD/placeholder steps. Types consistent: `SpringPageMeta`, `MAX_ANNOUNCEMENT_PAGES = 50`, `BsuirConfigurationError`.
