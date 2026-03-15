export type Weekday =
  | "Понедельник"
  | "Вторник"
  | "Среда"
  | "Четверг"
  | "Пятница"
  | "Суббота";

export interface ApiDateResponse {
  lastUpdateDate: string;
}

export interface StudentGroupShort {
  id: number;
  name: string;
}

export type Maybe<T> = T | null;
