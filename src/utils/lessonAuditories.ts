import type { ScheduleItem } from "../types/schedule";

/**
 * Returns a shallow copy of `item.auditories`, or `[]` when missing/invalid.
 */
export function lessonAuditories(item: Pick<ScheduleItem, "auditories">): string[] {
  // Typed as an array, but sparse IIS payloads may carry a null/absent value.
  const auditories: unknown = item.auditories;
  return Array.isArray(auditories) ? [...(auditories as string[])] : [];
}
