import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("catalog modules", () => {
  it("loads all list endpoints", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: [{ name: "053503", id: 1 }] }),
      createJsonResponse({ body: [{ urlId: "s-nesterenkov", id: 10 }] }),
      createJsonResponse({ body: [{ id: 20026, name: "ФКСиС", abbrev: "ФКСиС" }] }),
      createJsonResponse({ body: [{ id: 20027, name: "ПОИТ", abbrev: "ПОИТ" }] }),
      createJsonResponse({ body: [{ id: 1, name: "ИиТП", abbrev: "ИиТП", educationForm: [] }] }),
      createJsonResponse({ body: [{ id: 1, name: "104", note: "" }] })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

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
});
