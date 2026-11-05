import { createBsuirClient } from "../../src";
import type { StudentGroupCatalogItem } from "../../src/types/catalog";
import type {
  FlattenedScheduleItem,
  ScheduleItem,
  ScheduleResponse
} from "../../src/types/schedule";

const fetchImpl = (async () => new Response()) as typeof fetch;
const client = createBsuirClient({ fetch: fetchImpl });

const flat: Promise<readonly FlattenedScheduleItem[]> = client.schedule.getGroupBySubgroup(
  "053503",
  1
);
const raw: Promise<readonly ScheduleItem[]> = client.schedule.getGroupBySubgroupRaw("053503", 1);
const envelope: Promise<ScheduleResponse> = client.schedule.getGroupBySubgroupEnvelope("053503", 1);

const empFlat: Promise<readonly FlattenedScheduleItem[]> = client.schedule.getEmployeeBySubgroup(
  "s-nesterenkov",
  1
);
const empRaw: Promise<readonly ScheduleItem[]> = client.schedule.getEmployeeBySubgroupRaw(
  "s-nesterenkov",
  1
);
const empEnvelope: Promise<ScheduleResponse> = client.schedule.getEmployeeBySubgroupEnvelope(
  "s-nesterenkov",
  1
);

void flat;
void raw;
void envelope;
void empFlat;
void empRaw;
void empEnvelope;

// @ts-expect-error raw flag removed from getGroupBySubgroup
void client.schedule.getGroupBySubgroup("053503", 1, { raw: true });

// @ts-expect-error rawEnvelope flag removed from getEmployeeBySubgroup
void client.schedule.getEmployeeBySubgroup("s-nesterenkov", 1, { rawEnvelope: true });

type HasLegacyEnvelope = "getGroupEnvelope" extends keyof typeof client.schedule ? true : false;
const _legacyEnvelopeRemoved: HasLegacyEnvelope extends false ? true : never = true;

// Client results are deep-frozen at runtime, and the types say so.
function sortInPlace(list: StudentGroupCatalogItem[]): number {
  return list.length;
}

export async function readonlyResults(): Promise<void> {
  const groups = await client.groups.listAll();
  // @ts-expect-error catalog lists are readonly — copy (toSorted, spread) before reordering
  sortInPlace(groups);
  sortInPlace(groups.toSorted((a, b) => a.id - b.id));

  const schedule = await client.schedule.getGroup("053503");
  const lesson = schedule.lessons[0];
  if (lesson) {
    // @ts-expect-error lesson fields are readonly
    lesson.subject = "x";
  }
}
