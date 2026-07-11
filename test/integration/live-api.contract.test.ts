import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirApiError } from "../../src/client/errors";
import type { EmployeeCatalogItem } from "../../src/types/employee";
import type { Department, StudentGroupCatalogItem } from "../../src/types/catalog";

const runLiveTests = process.env.BSUIR_LIVE_TESTS === "1";
const describeLive = runLiveTests ? describe : describe.skip;

async function findWorkingGroupNumber(
  client: ReturnType<typeof createBsuirClient>
): Promise<string> {
  const groups = await client.groups.listAll();
  for (const group of groups.slice(0, 50)) {
    try {
      await client.schedule.getGroupRaw(group.name);
      return group.name;
    } catch (error) {
      if (error instanceof BsuirApiError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not find a group with available schedule in first 50 groups");
}

async function findWorkingEmployeeUrlId(
  client: ReturnType<typeof createBsuirClient>
): Promise<string> {
  const employees = await client.employees.listAll();
  for (const employee of employees.slice(0, 50)) {
    try {
      await client.schedule.getEmployeeRaw(employee.urlId);
      return employee.urlId;
    } catch (error) {
      if (error instanceof BsuirApiError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not find an employee with available schedule in first 50 employees");
}

describeLive("live API contract", () => {
  const client = createBsuirClient({
    timeoutMs: 15_000,
    retries: 2,
    retryDelayMs: 400,
    retryMaxDelayMs: 2000,
    retryJitter: true
  });

  it("loads core catalogs and validates minimal DTO shape", async () => {
    const [groups, employees, departments, faculties, specialities, auditories] = await Promise.all(
      [
        client.groups.listAll(),
        client.employees.listAll(),
        client.departments.listAll(),
        client.faculties.listAll(),
        client.specialities.listAll(),
        client.auditories.listAll()
      ]
    );

    expect(Array.isArray(groups)).toBe(true);
    expect(Array.isArray(employees)).toBe(true);
    expect(Array.isArray(departments)).toBe(true);
    expect(Array.isArray(faculties)).toBe(true);
    expect(Array.isArray(specialities)).toBe(true);
    expect(Array.isArray(auditories)).toBe(true);

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

    const sampleGroup = groups[0] as StudentGroupCatalogItem | undefined;
    const sampleEmployee = employees[0] as EmployeeCatalogItem | undefined;
    const sampleDepartment = departments[0] as Department | undefined;

    expect(sampleGroup?.name).toEqual(expect.any(String));
    expect(sampleGroup?.id).toEqual(expect.any(Number));
    expect(sampleEmployee?.urlId).toEqual(expect.any(String));
    expect(sampleEmployee?.id).toEqual(expect.any(Number));
    expect(sampleDepartment?.id).toEqual(expect.any(Number));
  }, 60_000);

  it("loads schedule, meta and announcements for live entities", async () => {
    const [workingGroupNumber, workingEmployeeUrlId] = await Promise.all([
      findWorkingGroupNumber(client),
      findWorkingEmployeeUrlId(client)
    ]);

    const [groupSchedule, employeeSchedule, currentWeek, employeeUpdate] = await Promise.all([
      client.schedule.getGroup(workingGroupNumber),
      client.schedule.getEmployee(workingEmployeeUrlId),
      client.schedule.getCurrentWeek(),
      client.schedule.getLastUpdateByEmployee({ urlId: "s-nesterenkov" })
    ]);

    expect(groupSchedule).toHaveProperty("lessons");
    expect(groupSchedule).toHaveProperty("schedules");
    expect(employeeSchedule).toHaveProperty("lessons");
    expect(employeeSchedule).toHaveProperty("schedules");
    expect(currentWeek).toEqual(expect.any(Number));
    expect(employeeUpdate.lastUpdateDate).toEqual(expect.any(String));

    try {
      const groupUpdate = await client.schedule.getLastUpdateByGroup({
        groupNumber: workingGroupNumber
      });
      expect(groupUpdate.lastUpdateDate).toEqual(expect.any(String));
    } catch (error) {
      if (!(error instanceof BsuirApiError)) {
        throw error;
      }
      // Legacy IIS endpoint; may fail for newer group identifiers (e.g. six-digit 524404).
    }

    const employeeAnnouncements = await client.announcements.byEmployee("s-nesterenkov");
    let departmentAnnouncements: unknown;
    try {
      departmentAnnouncements = await client.announcements.byDepartment(20_027);
    } catch (error) {
      if (error instanceof BsuirApiError && [400, 422].includes(error.status)) {
        departmentAnnouncements = [];
      } else {
        throw error;
      }
    }

    expect(Array.isArray(employeeAnnouncements)).toBe(true);
    expect(Array.isArray(departmentAnnouncements)).toBe(true);
  }, 60_000);

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
});
