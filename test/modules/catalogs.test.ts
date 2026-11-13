import { describe, expect, it, vi } from "vitest";
import { BsuirResponseValidationError, createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("catalog modules", () => {
  it("loads all list endpoints", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: [{ name: "053503", id: 1 }] }),
      createJsonResponse({ body: [{ urlId: "s-nesterenkov", id: 10 }] }),
      createJsonResponse({ body: [{ id: 20_026, name: "ФКСиС", abbrev: "ФКСиС" }] }),
      createJsonResponse({ body: [{ id: 20_027, name: "ПОИТ", abbrev: "ПОИТ" }] }),
      createJsonResponse({ body: [{ id: 1, name: "ИиТП", abbrev: "ИиТП", educationForm: [] }] }),
      createJsonResponse({ body: [{ id: 1, name: "104", note: "" }] })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const groups = await client.groups.listAll();
    const employees = await client.employees.listAll();
    const faculties = await client.faculties.listAll();
    const departments = await client.departments.listAll();
    const specialities = await client.specialities.listAll();
    const auditories = await client.auditories.listAll();

    expect(groups[0]?.name).toBe("053503");
    expect(employees[0]?.urlId).toBe("s-nesterenkov");
    expect(faculties[0]?.abbrev).toBe("ФКСиС");
    expect(departments[0]?.abbrev).toBe("ПОИТ");
    expect(specialities[0]?.name).toBe("ИиТП");
    expect(auditories[0]?.name).toBe("104");
  });

  it("returns an empty list when API responds with []", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [] })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.groups.listAll()).resolves.toEqual([]);
  });

  it("rejects non-array catalog payloads when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: {} })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.departments.listAll()).rejects.toThrow();
  });

  it("rejects non-array catalog payloads even when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.departments.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

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

  it("listAll sends a single request for a plain array", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      createJsonResponse({ body: [{ name: "A", id: 1 }] })
    );
    const client = createBsuirClient({ fetch: fetchImpl as unknown as typeof fetch });

    await expect(client.groups.listAll()).resolves.toEqual([{ name: "A", id: 1 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://iis.bsuir.by/api/v1/student-groups");
  });

  // 3.0: listAll used to stop after the first page of a paginated catalog (a separate
  // listAllPages fetched the rest), silently truncating the result.
  it("listAll concatenates all Spring pages", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: {
          content: [{ name: "A", id: 1 }],
          pageable: { pageNumber: 0, pageSize: 1 },
          totalPages: 2,
          totalElements: 2,
          last: false
        }
      }),
      createJsonResponse({
        body: {
          content: [{ name: "B", id: 2 }],
          pageable: { pageNumber: 1, pageSize: 1 },
          totalPages: 2,
          totalElements: 2,
          last: true
        }
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    await expect(client.groups.listAll()).resolves.toEqual([
      { name: "A", id: 1 },
      { name: "B", id: 2 }
    ]);
    expect(vi.mocked(fetchImpl).mock.calls[1]?.[0]).toBe(
      "https://iis.bsuir.by/api/v1/student-groups?page=1&size=1"
    );
  });

  it("listAll throws when totalPages exceeds safety cap", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: {
          content: [],
          pageable: { pageNumber: 0, pageSize: 20 },
          totalPages: 51,
          last: false
        }
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("listAll validates every page in strict mode", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: { content: [{ id: 1, name: "A", abbrev: "A" }], number: 0, size: 1, last: false }
      }),
      createJsonResponse({
        body: { content: [{ id: "2", name: "B", abbrev: "B" }], number: 1, size: 1, last: true }
      })
    ]);
    const client = createBsuirClient.strict({ fetch: fetchImpl });

    await expect(client.faculties.listAll()).rejects.toThrow("'[0].id' must be a finite number");
  });

  // Regression: results used to be frozen only when cache/dedup was enabled, so code
  // that sorted a catalog in place worked in dev and threw in production.
  it.each([
    ["no cache, no dedup", {}],
    ["cache", { cache: { ttlMs: 60_000 } }],
    ["dedupeInFlight", { dedupeInFlight: true }]
  ])("returns deep-frozen catalogs regardless of options (%s)", async (_label, options) => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: [
          { id: 2, name: "b" },
          { id: 1, name: "a" }
        ]
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, ...options });
    const groups = await client.groups.listAll();
    expect(Object.isFrozen(groups)).toBe(true);
    expect(Object.isFrozen(groups[0])).toBe(true);
    expect(groups.toSorted((a, b) => a.id - b.id).map((group) => group.id)).toEqual([1, 2]);
  });

  it("does not cache a 2xx HTML page and refetches on the next call (non-strict)", async () => {
    const html = (): Response =>
      new Response("<html>maintenance</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    const fetchImpl = mockFetchSequence([
      html(),
      createJsonResponse({ body: [{ id: 1, name: "F", abbrev: "F" }] }),
      html(),
      createJsonResponse({ body: [{ id: 2 }] })
    ]);
    const onResponse = vi.fn();
    const onError = vi.fn();
    const client = createBsuirClient({
      fetch: fetchImpl,
      cache: { ttlMs: 60_000 },
      hooks: { onResponse, onError }
    });

    await expect(client.faculties.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
    // The failed call ends with onError only — never a misleading onResponse.
    expect(onResponse).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    await expect(client.faculties.listAll()).resolves.toHaveLength(1);

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
    await expect(client.groups.listAll()).resolves.toEqual([{ id: 2 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("freezes the concatenated multi-page listAll result", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { content: [{ id: 1 }], number: 0, size: 1, last: false } }),
      createJsonResponse({ body: { content: [{ id: 2 }], number: 1, size: 1, last: true } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const groups = await client.groups.listAll();
    expect(groups.map((group) => group.id)).toEqual([1, 2]);
    expect(Object.isFrozen(groups)).toBe(true);
  });
});
