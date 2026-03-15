import type { Maybe } from "./common";

export interface Employee {
  firstName: string;
  lastName: string;
  middleName: string;
  degree: string;
  degreeAbbrev?: string;
  email: Maybe<string>;
  rank: Maybe<string>;
  photoLink: string;
  calendarId: string;
  id: number;
  urlId: string;
  jobPositions: Maybe<string[]>;
}

export interface EmployeeCatalogItem {
  firstName: string;
  lastName: string;
  middleName: string;
  degree: string;
  rank: string;
  photoLink: string;
  calendarId: string;
  academicDepartment?: string[];
  id: number;
  urlId: string;
  fio: string;
}
