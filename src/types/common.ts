export const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота"
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Payload from IIS legacy `last-update-date/*` endpoints (`schedule.getLastUpdateByGroup` / `getLastUpdateByEmployee`). */
export interface ApiDateResponse {
  lastUpdateDate: string;
}

export interface StudentGroupShort {
  id: number;
  name: string;
}

export type Maybe<T> = T | null;
