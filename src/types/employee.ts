import type { Maybe } from "./common";

/** Employee DTO embedded in schedule lessons and employee schedule envelopes. */
export interface Employee {
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName: string;
  readonly degree: string;
  readonly degreeAbbrev?: string;
  readonly email: Maybe<string>;
  readonly rank: Maybe<string>;
  readonly photoLink: string;
  readonly calendarId: string;
  readonly id: number;
  readonly urlId: string;
  readonly jobPositions: Maybe<readonly string[]>;
}

/** Employee row from the `/employees/all` catalog. */
export interface EmployeeCatalogItem {
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName: string;
  readonly degree: string;
  readonly rank: string;
  readonly photoLink: string;
  readonly calendarId: string;
  readonly academicDepartment?: readonly string[];
  readonly id: number;
  readonly urlId: string;
  readonly fio: string;
}
