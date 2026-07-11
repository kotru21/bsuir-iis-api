import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirApiError } from "../../src/client/errors";
import type { EmployeeCatalogItem } from "../../src/types/employee";
import type { Department, StudentGroupCatalogItem } from "../../src/types/catalog";

const runLiveTests = process.env.BSUIR_LIVE_TESTS === "1";
const describeLive = runLiveTests ? describe : describe.skip;

async function findWorkingGroupNumber(
  client: ReturnType<typeof createBsuirClient>
): Promise<string | undefined> {
  const groups = await client.groups.listAll();
  for (const group of groups.slice(0, 50)) {
    try {
      await client.schedule.getGroupRaw(group.name);
      return group.name;
    } catch (error) {
      if (
        error instanceof BsuirApiError &&
        (error.status === 404 || error.status === 503 || error.message.includes("Invalid JSON"))
      ) {
        continue;
      }
      throw error;
    }
  }

  return undefined;
}

async function findWorkingEmployeeUrlId(
  client: ReturnType<typeof createBsuirClient>
): Promise<string | undefined> {
  const employees = await client.employees.listAll();
  for (const employee of employees.slice(0, 50)) {
    try {
      await client.schedule.getEmployeeRaw(employee.urlId);
      return employee.urlId;
    } catch (error) {
      if (
        error instanceof BsuirApiError &&
        (error.status === 404 || error.status === 503 || error.message.includes("Invalid JSON"))
      ) {
        continue;
      }
      throw error;
    }
  }

  return undefined;
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

    if (workingGroupNumber && workingEmployeeUrlId) {
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
    } else {
      // IIS schedule endpoints intermittently return 503; announcements still asserted below.
      console.warn(
        "Skipping schedule/meta assertions: no working group/employee schedule available from IIS"
      );
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
    let capturedTotalElements: number | undefined;

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
        if (typeof page.totalElements === "number") {
          capturedTotalElements = page.totalElements;
        }
        if (page.last === false || (typeof page.totalPages === "number" && page.totalPages > 1)) {
          expect(page.content.length).toBeGreaterThan(0);
        }
      } else if (isArray) {
        capturedTotalElements = rawPayload.length;
      }
    }

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
    if (typeof capturedTotalElements === "number") {
      expect(viaSdk.length).toBe(capturedTotalElements);
    }
  }, 60_000);
});
