import type { StudentGroupShort } from "./common";

/** Announcement posted by an employee for one or more student groups. */
export interface Announcement {
  readonly id: number;
  readonly employee: string;
  readonly content: string;
  readonly date: string;
  readonly employeeDepartments: readonly string[];
  readonly studentGroups: readonly StudentGroupShort[];
}
