/** Faculty catalog entry from IIS. */
export interface Faculty {
  readonly id: number;
  readonly name: string;
  readonly abbrev: string;
}

/** Department catalog entry from IIS. */
export interface Department {
  readonly id: number;
  readonly name: string;
  readonly abbrev: string;
}

/** Education form (full-time, part-time, etc.) nested under specialities. */
export interface EducationForm {
  readonly id: number;
  readonly name: string;
}

/**
 * The live IIS API returns `educationForm` as either a single object or an array
 * depending on the endpoint and context. Use `Array.isArray(educationForm)` to distinguish.
 */
export type SpecialityEducationForm = EducationForm | readonly EducationForm[];

/** Speciality catalog entry from IIS. */
export interface Speciality {
  readonly id: number;
  readonly name: string;
  readonly abbrev: string;
  readonly educationForm: SpecialityEducationForm;
  readonly facultyId: number;
  readonly code: string;
}

/** Student group row from the `/student-groups` catalog. */
export interface StudentGroupCatalogItem {
  readonly name: string;
  readonly facultyId: number;
  readonly facultyName?: string;
  readonly facultyAbbrev?: string;
  readonly specialityDepartmentEducationFormId: number;
  readonly specialityName: string;
  readonly specialityAbbrev?: string;
  /** `null` for some groups (e.g. retraining programmes). */
  readonly course: number | null;
  readonly id: number;
  readonly calendarId: string;
  readonly educationDegree?: number;
}

/** Room type metadata nested under an auditory. */
export interface AuditoryType {
  readonly id: number;
  readonly name: string;
  readonly abbrev: string;
}

/** Building number nested under an auditory. */
export interface BuildingNumber {
  readonly id: number;
  readonly name: string;
}

/** Department fragment nested under an auditory. */
export interface AuditoryDepartment {
  readonly idDepartment: number;
  readonly abbrev: string;
  readonly name: string;
  readonly nameAndAbbrev: string;
}

/** Auditory (classroom) catalog entry from IIS. */
export interface Auditory {
  readonly id: number;
  readonly name: string;
  readonly note: string | null;
  readonly capacity: number | null;
  readonly auditoryType: AuditoryType;
  readonly buildingNumber: BuildingNumber;
  /** `null` for rooms not assigned to a department. */
  readonly department: AuditoryDepartment | null;
}
