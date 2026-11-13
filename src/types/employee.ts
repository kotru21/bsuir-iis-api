import type { Maybe } from "./common";

/** Employee DTO embedded in schedule lessons and employee schedule envelopes. */
export interface Employee {
  readonly firstName: string;
  readonly lastName: string;
  /** `null` for employees without a patronymic. */
  readonly middleName: Maybe<string>;
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
  /** `null` for employees without a patronymic. */
  readonly middleName: Maybe<string>;
  readonly degree: string;
  /** Academic rank; `null` for most employees on live IIS payloads. */
  readonly rank: Maybe<string>;
  readonly photoLink: string;
  readonly calendarId: string;
  readonly academicDepartment?: readonly string[];
  readonly id: number;
  readonly urlId: string;
  readonly fio: string;
}
