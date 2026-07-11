/** Faculty catalog entry from IIS. */
export interface Faculty {
  id: number;
  name: string;
  abbrev: string;
}

/** Department catalog entry from IIS. */
export interface Department {
  id: number;
  name: string;
  abbrev: string;
}

/** Education form (full-time, part-time, etc.) nested under specialities. */
export interface EducationForm {
  id: number;
  name: string;
}

/**
 * The live IIS API returns `educationForm` as either a single object or an array
 * depending on the endpoint and context. Use `Array.isArray(educationForm)` to distinguish.
 */
export type SpecialityEducationForm = EducationForm | EducationForm[];

/** Speciality catalog entry from IIS. */
export interface Speciality {
  id: number;
  name: string;
  abbrev: string;
  educationForm: SpecialityEducationForm;
  facultyId: number;
  code: string;
}

/** Student group row from the `/student-groups` catalog. */
export interface StudentGroupCatalogItem {
  name: string;
  facultyId: number;
  facultyName?: string;
  facultyAbbrev?: string;
  specialityDepartmentEducationFormId: number;
  specialityName: string;
  specialityAbbrev?: string;
  course: number;
  id: number;
  calendarId: string;
  educationDegree?: number;
}

/** Room type metadata nested under an auditory. */
export interface AuditoryType {
  id: number;
  name: string;
  abbrev: string;
}

/** Building number nested under an auditory. */
export interface BuildingNumber {
  id: number;
  name: string;
}

/** Department fragment nested under an auditory. */
export interface AuditoryDepartment {
  idDepartment: number;
  abbrev: string;
  name: string;
  nameAndAbbrev: string;
}

/** Auditory (classroom) catalog entry from IIS. */
export interface Auditory {
  id: number;
  name: string;
  note: string;
  capacity: number | null;
  auditoryType: AuditoryType;
  buildingNumber: BuildingNumber;
  department: AuditoryDepartment;
}
