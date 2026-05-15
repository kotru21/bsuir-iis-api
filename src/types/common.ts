export type Weekday = "Понедельник" | "Вторник" | "Среда" | "Четверг" | "Пятница" | "Суббота";

/** Payload from IIS legacy `last-update-date/*` endpoints (`schedule.getLastUpdateByGroup` / `getLastUpdateByEmployee`). */
export interface ApiDateResponse {
  lastUpdateDate: string;
}

export interface StudentGroupShort {
  id: number;
  name: string;
}

export type Maybe<T> = T | null;
