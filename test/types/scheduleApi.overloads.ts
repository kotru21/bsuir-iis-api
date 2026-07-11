import { createBsuirClient } from "../../src";
import type {
  FlattenedScheduleItem,
  ScheduleItem,
  ScheduleResponse
} from "../../src/types/schedule";

const fetchImpl = (async () => new Response()) as typeof fetch;
const client = createBsuirClient({ fetch: fetchImpl });

const flat: Promise<FlattenedScheduleItem[]> = client.schedule.getGroupBySubgroup("053503", 1);
const raw: Promise<ScheduleItem[]> = client.schedule.getGroupBySubgroupRaw("053503", 1);
const envelope: Promise<ScheduleResponse> = client.schedule.getGroupBySubgroupEnvelope("053503", 1);

const empFlat: Promise<FlattenedScheduleItem[]> = client.schedule.getEmployeeBySubgroup(
  "s-nesterenkov",
  1
);
const empRaw: Promise<ScheduleItem[]> = client.schedule.getEmployeeBySubgroupRaw(
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
void _legacyEnvelopeRemoved;
