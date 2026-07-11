import type { StudentGroupShort } from "./common";

/** Announcement posted by an employee for one or more student groups. */
export interface Announcement {
  id: number;
  employee: string;
  content: string;
  date: string;
  employeeDepartments: string[];
  studentGroups: StudentGroupShort[];
}
