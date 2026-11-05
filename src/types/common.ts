/** Ordered BSUIR weekdays used as schedule map keys (Sunday is omitted). */
export const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота"
] as const;

/** One of the six BSUIR weekday labels in {@link WEEKDAYS}. */
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_SET: ReadonlySet<string> = new Set(WEEKDAYS);

/** Whether a schedule map key is one of {@link WEEKDAYS} (internal, not re-exported). */
export function isWeekday(key: string): key is Weekday {
  return WEEKDAY_SET.has(key);
}

/** Compact student-group reference nested under announcements. */
export interface StudentGroupShort {
  readonly id: number;
  readonly name: string;
}

/** Nullable value helper used across IIS DTOs (`T | null`). */
export type Maybe<T> = T | null;
