import { createBsuirClient } from "../../../src";
import { BsuirApiError } from "../../../src/client/errors";
import type { LiveClient } from "./client";

/** Known employee fixture used by announcements + soft last-update. */
export const LIVE_EMPLOYEE_URL_ID = "s-nesterenkov";

/** Known department id used by announcements.byDepartment. */
export const LIVE_DEPARTMENT_ID = 20_027;

const PROBE_LIMIT = 50;
/** Stop scanning when IIS schedule looks degraded (avoids beforeAll hook timeouts). */
const CONSECUTIVE_503_ABORT = 5;

let cachedWorkingGroupNumber: string | undefined | null = null;
let cachedWorkingEmployeeUrlId: string | undefined | null = null;
let groupProbePromise: Promise<string | undefined> | null = null;
let employeeProbePromise: Promise<string | undefined> | null = null;

/** Fail-fast client for schedule probes — retries on 503 blow the 60s beforeAll budget. */
function createProbeClient(): LiveClient {
  return createBsuirClient({
    timeoutMs: 10_000,
    retries: 0
  });
}

function isTransientScheduleMiss(error: unknown): boolean {
  return (
    error instanceof BsuirApiError &&
    (error.status === 404 || error.status === 503 || error.message.includes("Invalid JSON"))
  );
}

function isServiceUnavailable(error: unknown): boolean {
  return error instanceof BsuirApiError && error.status === 503;
}

async function probeWorkingGroupNumber(): Promise<string | undefined> {
  if (cachedWorkingGroupNumber !== null) {
    return cachedWorkingGroupNumber ?? undefined;
  }

  const probeClient = createProbeClient();
  const groups = await probeClient.groups.listAll();

  let consecutive503 = 0;
  for (const group of groups.slice(0, PROBE_LIMIT)) {
    try {
      await probeClient.schedule.getGroupRaw(group.name);
      cachedWorkingGroupNumber = group.name;
      return group.name;
    } catch (error) {
      if (isServiceUnavailable(error)) {
        consecutive503 += 1;
        if (consecutive503 >= CONSECUTIVE_503_ABORT) {
          cachedWorkingGroupNumber = undefined;
          return undefined;
        }
        continue;
      }
      consecutive503 = 0;
      if (isTransientScheduleMiss(error)) {
        continue;
      }
      throw error;
    }
  }

  cachedWorkingGroupNumber = undefined;
  return undefined;
}

async function probeWorkingEmployeeUrlId(): Promise<string | undefined> {
  if (cachedWorkingEmployeeUrlId !== null) {
    return cachedWorkingEmployeeUrlId ?? undefined;
  }

  const probeClient = createProbeClient();

  try {
    await probeClient.schedule.getEmployeeRaw(LIVE_EMPLOYEE_URL_ID);
    cachedWorkingEmployeeUrlId = LIVE_EMPLOYEE_URL_ID;
    return LIVE_EMPLOYEE_URL_ID;
  } catch (error) {
    if (!isTransientScheduleMiss(error)) {
      throw error;
    }
  }

  const employees = await probeClient.employees.listAll();

  let consecutive503 = 0;
  for (const employee of employees.slice(0, PROBE_LIMIT)) {
    if (employee.urlId === LIVE_EMPLOYEE_URL_ID) {
      continue;
    }
    try {
      await probeClient.schedule.getEmployeeRaw(employee.urlId);
      cachedWorkingEmployeeUrlId = employee.urlId;
      return employee.urlId;
    } catch (error) {
      if (isServiceUnavailable(error)) {
        consecutive503 += 1;
        if (consecutive503 >= CONSECUTIVE_503_ABORT) {
          cachedWorkingEmployeeUrlId = undefined;
          return undefined;
        }
        continue;
      }
      consecutive503 = 0;
      if (isTransientScheduleMiss(error)) {
        continue;
      }
      throw error;
    }
  }

  cachedWorkingEmployeeUrlId = undefined;
  return undefined;
}

export async function findWorkingGroupNumber(_client: LiveClient): Promise<string | undefined> {
  if (cachedWorkingGroupNumber !== null) {
    return cachedWorkingGroupNumber ?? undefined;
  }
  groupProbePromise ??= probeWorkingGroupNumber();
  return groupProbePromise;
}

export async function findWorkingEmployeeUrlId(_client: LiveClient): Promise<string | undefined> {
  if (cachedWorkingEmployeeUrlId !== null) {
    return cachedWorkingEmployeeUrlId ?? undefined;
  }
  employeeProbePromise ??= probeWorkingEmployeeUrlId();
  return employeeProbePromise;
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
