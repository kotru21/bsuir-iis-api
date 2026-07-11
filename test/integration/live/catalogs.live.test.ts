import { expect, it } from "vitest";
import type { EmployeeCatalogItem } from "../../../src/types/employee";
import type { Department, StudentGroupCatalogItem } from "../../../src/types/catalog";
import { createLiveClient } from "./client";
import { describeLive } from "./gate";

describeLive("live catalogs contract", () => {
  const client = createLiveClient();

  it("loads all six listAll catalogs and validates minimal DTO shape", async () => {
    const [groups, employees, departments, faculties, specialities, auditories] =
      await Promise.all([
        client.groups.listAll(),
        client.employees.listAll(),
        client.departments.listAll(),
        client.faculties.listAll(),
        client.specialities.listAll(),
        client.auditories.listAll()
      ]);

    for (const [label, value] of [
      ["groups", groups],
      ["employees", employees],
      ["departments", departments],
      ["faculties", faculties],
      ["specialities", specialities],
      ["auditories", auditories]
    ] as const) {
      expect(Array.isArray(value), `${label} must be an array (not a page object)`).toBe(
        true
      );
      expect(value, `${label} must not look like a raw Spring page`).not.toHaveProperty(
        "content"
      );
    }

    const sampleGroup = groups[0] as StudentGroupCatalogItem | undefined;
    const sampleEmployee = employees[0] as EmployeeCatalogItem | undefined;
    const sampleDepartment = departments[0] as Department | undefined;

    expect(sampleGroup?.name).toEqual(expect.any(String));
    expect(sampleGroup?.id).toEqual(expect.any(Number));
    expect(sampleEmployee?.urlId).toEqual(expect.any(String));
    expect(sampleEmployee?.id).toEqual(expect.any(Number));
    expect(sampleDepartment?.id).toEqual(expect.any(Number));
  }, 60_000);
});
