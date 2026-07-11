import { BsuirApiError } from "../../../src/client/errors";
import type { LiveClient } from "./client";

/** Known employee fixture used by announcements + soft last-update. */
export const LIVE_EMPLOYEE_URL_ID = "s-nesterenkov";

/** Known department id used by announcements.byDepartment. */
export const LIVE_DEPARTMENT_ID = 20_027;

const PROBE_LIMIT = 50;

let cachedWorkingGroupNumber: string | undefined | null = null;
let cachedWorkingEmployeeUrlId: string | undefined | null = null;

function isTransientScheduleMiss(error: unknown): boolean {
  return (
    error instanceof BsuirApiError &&
    (error.status === 404 || error.status === 503 || error.message.includes("Invalid JSON"))
  );
}

export async function findWorkingGroupNumber(client: LiveClient): Promise<string | undefined> {
  if (cachedWorkingGroupNumber !== null) {
    return cachedWorkingGroupNumber ?? undefined;
  }

  const groups = await client.groups.listAll();
  for (const group of groups.slice(0, PROBE_LIMIT)) {
    try {
      await client.schedule.getGroupRaw(group.name);
      cachedWorkingGroupNumber = group.name;
      return group.name;
    } catch (error) {
      if (isTransientScheduleMiss(error)) {
        continue;
      }
      throw error;
    }
  }

  cachedWorkingGroupNumber = undefined;
  return undefined;
}

export async function findWorkingEmployeeUrlId(client: LiveClient): Promise<string | undefined> {
  if (cachedWorkingEmployeeUrlId !== null) {
    return cachedWorkingEmployeeUrlId ?? undefined;
  }

  const employees = await client.employees.listAll();
  for (const employee of employees.slice(0, PROBE_LIMIT)) {
    try {
      await client.schedule.getEmployeeRaw(employee.urlId);
      cachedWorkingEmployeeUrlId = employee.urlId;
      return employee.urlId;
    } catch (error) {
      if (isTransientScheduleMiss(error)) {
        continue;
      }
      throw error;
    }
  }

  cachedWorkingEmployeeUrlId = undefined;
  return undefined;
}

export async function resolveWorkingScheduleEntities(client: LiveClient): Promise<{
  groupNumber: string | undefined;
  employeeUrlId: string | undefined;
  available: boolean;
}> {
  const [groupNumber, employeeUrlId] = await Promise.all([
    findWorkingGroupNumber(client),
    findWorkingEmployeeUrlId(client)
  ]);
  return {
    groupNumber,
    employeeUrlId,
    available: Boolean(groupNumber && employeeUrlId)
  };
}

export const SCHEDULE_PROBE_WARN =
  "Skipping schedule-dependent live assertions: no working group/employee schedule available from IIS";
