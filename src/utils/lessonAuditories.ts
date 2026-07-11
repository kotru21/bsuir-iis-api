import type { ScheduleItem } from "../types/schedule";

/**
 * Returns a shallow copy of `item.auditories`, or `[]` when missing/invalid.
 */
export function lessonAuditories(item: Pick<ScheduleItem, "auditories">): string[] {
  const { auditories } = item;
  return Array.isArray(auditories) ? [...auditories] : [];
}
