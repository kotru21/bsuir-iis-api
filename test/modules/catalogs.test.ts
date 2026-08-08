import { describe, expect, it, vi } from "vitest";
import {
  BsuirConfigurationError,
  BsuirResponseValidationError,
  createBsuirClient
} from "../../src";
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

  it("listAll returns first page only and does not fetch page 2", async () => {
    const page0 = [{ name: "A", id: 1 }];
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        body: {
          content: page0,
          pageable: { pageNumber: 0, pageSize: 1 },
          totalPages: 2,
          totalElements: 2,
          last: false
        }
      })
    );
    const client = createBsuirClient({
      fetch: fetchImpl as unknown as typeof fetch,
      validateResponses: false
    });

    await expect(client.groups.listAll()).resolves.toEqual(page0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("listAllPages concatenates all Spring pages", async () => {
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

    await expect(client.groups.listAllPages()).resolves.toEqual([
      { name: "A", id: 1 },
      { name: "B", id: 2 }
    ]);
  });

  it("listAllPages throws when totalPages exceeds safety cap", async () => {
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

    await expect(client.groups.listAllPages()).rejects.toBeInstanceOf(BsuirConfigurationError);
  });
});
