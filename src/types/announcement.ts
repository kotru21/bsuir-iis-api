import type { StudentGroupShort } from "./common";

export interface Announcement {
  id: number;
  employee: string;
  content: string;
  date: string;
  employeeDepartments: string[];
  studentGroups: StudentGroupShort[];
}
