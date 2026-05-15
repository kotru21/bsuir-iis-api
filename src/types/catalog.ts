export interface Faculty {
  id: number;
  name: string;
  abbrev: string;
}

export interface Department {
  id: number;
  name: string;
  abbrev: string;
}

export interface EducationForm {
  id: number;
  name: string;
}

/**
 * The live IIS API returns `educationForm` as either a single object or an array
 * depending on the endpoint and context. Use `Array.isArray(educationForm)` to distinguish.
 */
export type SpecialityEducationForm = EducationForm | EducationForm[];

export interface Speciality {
  id: number;
  name: string;
  abbrev: string;
  educationForm: SpecialityEducationForm;
  facultyId: number;
  code: string;
}

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

export interface AuditoryType {
  id: number;
  name: string;
  abbrev: string;
}

export interface BuildingNumber {
  id: number;
  name: string;
}

export interface AuditoryDepartment {
  idDepartment: number;
  abbrev: string;
  name: string;
  nameAndAbbrev: string;
}

export interface Auditory {
  id: number;
  name: string;
  note: string;
  capacity: number | null;
  auditoryType: AuditoryType;
  buildingNumber: BuildingNumber;
  department: AuditoryDepartment;
}