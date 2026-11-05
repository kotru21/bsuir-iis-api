import { createBsuirClient, type ScheduleTarget } from "../../src";
import type { StudentGroupCatalogItem } from "../../src/types/catalog";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleItem,
  ScheduleResponse
} from "../../src/types/schedule";

const fetchImpl = (async () => new Response()) as typeof fetch;
const client = createBsuirClient({ fetch: fetchImpl });

export async function scheduleReads(): Promise<unknown[]> {
  const normalized: NormalizedScheduleResponse = await client.schedule.get({ group: "053503" });
  const filtered: NormalizedScheduleResponse = await client.schedule.get(
    { employee: "s-nesterenkov" },
    { includeNextSchedules: true, filter: { subgroup: 2, lessonTypeAbbrev: ["ЛК", "ПЗ"] } }
  );
  const raw: ScheduleResponse = await client.schedule.getRaw({ group: "053503" });
  const week: number = await client.schedule.getCurrentWeek();

  // A normalized (or filtered) result is also a valid ScheduleResponse envelope.
  const envelope: ScheduleResponse = filtered;
  // Flattened rows are ScheduleItems, so former *BySubgroupRaw results map onto them.
  const items: readonly ScheduleItem[] = filtered.lessons;
  const flat: readonly FlattenedScheduleItem[] = normalized.examLessons;
  return [raw, week, envelope, items, flat];
}

export function targets(): ScheduleTarget[] {
  return [
    { group: "053503" },
    { employee: "s-nesterenkov" },
    // @ts-expect-error a target names either a group or an employee, not both
    { group: "053503", employee: "s-nesterenkov" },
    // @ts-expect-error a target needs a group or an employee
    {},
    // @ts-expect-error group numbers are strings ("053503" keeps its leading zero)
    { group: 53_503 }
  ];
}

// @ts-expect-error raw output has no options beyond ReadOptions (no filter on the envelope)
void client.schedule.getRaw({ group: "053503" }, { filter: { subgroup: 1 } });

// 3.0 collapsed the per-subject/per-shape methods into get / getRaw.
type ScheduleModule = typeof client.schedule;
type RemovedMethods =
  | "getGroup"
  | "getEmployee"
  | "getGroupRaw"
  | "getEmployeeRaw"
  | "getGroupFiltered"
  | "getEmployeeFiltered"
  | "getGroupExams"
  | "getEmployeeExams"
  | "getGroupBySubgroup"
  | "getGroupBySubgroupRaw"
  | "getGroupBySubgroupEnvelope"
  | "getEmployeeBySubgroup"
  | "getEmployeeBySubgroupRaw"
  | "getEmployeeBySubgroupEnvelope"
  | "getGroupEnvelope";
type StillPresent = Extract<keyof ScheduleModule, RemovedMethods>;
export const removedMethodsAreGone: [StillPresent] extends [never] ? true : never = true;

// Client results are deep-frozen at runtime, and the types say so.
function sortInPlace(list: StudentGroupCatalogItem[]): number {
  return list.length;
}

export async function readonlyResults(): Promise<void> {
  const groups = await client.groups.listAll();
  // @ts-expect-error catalog lists are readonly — copy (toSorted, spread) before reordering
  sortInPlace(groups);
  sortInPlace(groups.toSorted((a, b) => a.id - b.id));

  const schedule = await client.schedule.get({ group: "053503" });
  const lesson = schedule.lessons[0];
  if (lesson) {
    // @ts-expect-error lesson fields are readonly
    lesson.subject = "x";
  }
}
