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

/** Compact student-group reference nested under announcements. */
export interface StudentGroupShort {
  id: number;
  name: string;
}

/** Nullable value helper used across IIS DTOs (`T | null`). */
export type Maybe<T> = T | null;
