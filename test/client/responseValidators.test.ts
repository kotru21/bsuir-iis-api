import { describe, expect, it } from "vitest";
import {
  assertAnnouncementListResponse,
  assertCatalogResponse,
  assertScheduleResponse,
  assertScheduleStructuralEnvelope
} from "../../src/client/responseValidators";
import {
  auditorySchema,
  facultySchema,
  specialitySchema,
  studentGroupCatalogItemSchema
} from "../../src/schema/dto";
import { BsuirResponseValidationError } from "../../src/client/errors";
import { normalizeSchedule } from "../../src";
import { buildScheduleResponse } from "../modules/scheduleFixtures";

describe("response validators", () => {
  it("accepts array payloads", () => {
    expect(() => assertCatalogResponse([], "/x", facultySchema)).not.toThrow();
  });

  it("rejects non-array payloads", () => {
    expect(() => assertCatalogResponse({}, "/x", facultySchema)).toThrow(
      "Invalid response payload for /x: expected array, got object"
    );
  });

  it("rejects null and primitive catalog payloads", () => {
    for (const payload of [null, "string", 42]) {
      expect(() => assertCatalogResponse(payload, "/x", facultySchema)).toThrow(
        BsuirResponseValidationError
      );
    }
  });

  it("accepts announcement list array payloads", () => {
    expect(() => assertAnnouncementListResponse([], "/announcements")).not.toThrow();
  });

  it("accepts paginated announcement envelope", () => {
    expect(() =>
      assertAnnouncementListResponse({ content: [{ id: 1 }], totalElements: 1 }, "/announcements")
    ).not.toThrow();
  });

  it("rejects invalid announcement list payloads", () => {
    expect(() => assertAnnouncementListResponse({}, "/announcements")).toThrow(
      BsuirResponseValidationError
    );
    expect(() => assertAnnouncementListResponse({ content: "nope" }, "/announcements")).toThrow(
      BsuirResponseValidationError
    );
  });

  // line 15 — ensureRecord: payload is array → asRecord returns null → throws
  it("rejects array payload in assertScheduleResponse (ensureRecord, line 15)", () => {
    expect(() => assertScheduleResponse([], "/schedule")).toThrow(BsuirResponseValidationError);
    expect(() => assertScheduleResponse(null, "/schedule")).toThrow(BsuirResponseValidationError);
    expect(() => assertScheduleResponse("text", "/schedule")).toThrow(BsuirResponseValidationError);
  });

  it("accepts valid schedule response shape", () => {
    expect(() =>
      assertScheduleResponse(
        {
          employeeDto: null,
          studentGroupDto: null,
          schedules: {},
          exams: [],
          startDate: null,
          endDate: null,
          startExamsDate: null,
          endExamsDate: null
        },
        "/schedule"
      )
    ).not.toThrow();
  });

  it("rejects invalid schedules shape", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: null, studentGroupDto: null, schedules: [], exams: [] },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("structural envelope rejects non-array day buckets without item checks", () => {
    expect(() =>
      assertScheduleStructuralEnvelope(
        {
          schedules: { Понедельник: "bad" },
          exams: []
        },
        "/schedule"
      )
    ).toThrow(/schedules\.Понедельник/);

    // Wrong lesson field types are deep-only; structural allows them.
    expect(() =>
      assertScheduleStructuralEnvelope(
        {
          schedules: { Понедельник: [{ numSubgroup: "0" }] },
          exams: []
        },
        "/schedule"
      )
    ).not.toThrow();
  });

  it("rejects invalid exams shape", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: null, studentGroupDto: null, schedules: {}, exams: {} },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("rejects invalid nullable dto fields", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: 5, studentGroupDto: null, schedules: {}, exams: [] },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  // line 88 — isNullableObject: studentGroupDto is array → false → throws
  it("rejects array studentGroupDto (isNullableObject, line 88)", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: null, studentGroupDto: [], schedules: {}, exams: [] },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("rejects catalog arrays with non-object elements", () => {
    const schema = studentGroupCatalogItemSchema;
    expect(() => assertCatalogResponse([1, 2], "/student-groups", schema)).toThrow(
      "'[0]' must be an object, got number"
    );
    expect(() => assertCatalogResponse([null], "/student-groups", schema)).toThrow(
      BsuirResponseValidationError
    );
    expect(() => assertCatalogResponse([{ id: 1 }], "/student-groups", schema)).not.toThrow();
  });

  it("checks catalog item fields against the DTO schema", () => {
    expect(() =>
      assertCatalogResponse([{ id: 1, name: 7, abbrev: "ФКСиС" }], "/faculties", facultySchema)
    ).toThrow("Invalid response payload for /faculties: '[0].name' must be string, got number");
    expect(() =>
      assertCatalogResponse(
        [{ id: 1, capacity: null, department: { idDepartment: "x" } }],
        "/auditories",
        auditorySchema
      )
    ).toThrow("'[0].department.idDepartment' must be a finite number, got string");
  });

  it("accepts both educationForm shapes of specialities and rejects others", () => {
    const form = { id: 1, name: "дневная" };
    expect(() =>
      assertCatalogResponse(
        [{ educationForm: form }, { educationForm: [form] }],
        "/specialities",
        specialitySchema
      )
    ).not.toThrow();
    expect(() =>
      assertCatalogResponse([{ educationForm: "дневная" }], "/specialities", specialitySchema)
    ).toThrow("'[0].educationForm' must be an object or an array, got string");
  });

  it("rejects announcement items with wrong field types", () => {
    expect(() =>
      assertAnnouncementListResponse([{ id: "x", content: "c", date: "d" }], "/announcements")
    ).toThrow(BsuirResponseValidationError);
    expect(() =>
      assertAnnouncementListResponse(
        [{ id: 1, content: "c", date: "d", employeeDepartments: [1] }],
        "/announcements"
      )
    ).toThrow(BsuirResponseValidationError);
    expect(() =>
      assertAnnouncementListResponse(
        { content: [{ id: 1, studentGroups: "nope" }] },
        "/announcements"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("accepts announcement items with omitted fields (validate-when-present)", () => {
    expect(() => assertAnnouncementListResponse([{ id: 1 }], "/announcements")).not.toThrow();
  });
});

describe("response validators — schedule item level", () => {
  it("accepts a fully populated schedule payload", () => {
    expect(() => assertScheduleResponse(buildScheduleResponse(), "/schedule")).not.toThrow();
  });

  it("accepts IIS announcement rows with null subject fields (live payload shape)", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      Object.assign(lesson, {
        subject: null,
        subjectFullName: null,
        lessonTypeAbbrev: null,
        note: "Последняя лекция в семестре",
        announcement: true,
        dateLesson: "14.11.2026"
      });
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).not.toThrow();
  });

  it("accepts announcement rows with auditories: null (live: group 450504, Nov 2026)", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      Object.assign(lesson, {
        subject: null,
        lessonTypeAbbrev: null,
        auditories: null,
        announcement: true,
        startLessonTime: "01:00",
        endLessonTime: "23:00",
        dateLesson: "06.11.2026"
      });
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).not.toThrow();
    // Normalized views keep their array guarantee.
    const normalized = normalizeSchedule(payload, { validate: true });
    expect(normalized.lessonsByDay.Понедельник[0]?.auditories).toEqual([]);
    expect(normalized.schedules.Понедельник?.[0]?.auditories).toEqual([]);
  });

  it("still rejects non-string, non-null subject", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { subject: unknown }).subject = 42;
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(
      /subject' must be string or null/
    );
  });

  it("rejects lesson with non-array weekNumber", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { weekNumber: unknown }).weekNumber = "1";
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/weekNumber/);
  });

  it("rejects lesson with non-string auditories element", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { auditories: unknown }).auditories = [101];
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/auditories\[0\]/);
  });

  it("rejects lesson with wrong scalar field types", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { numSubgroup: unknown }).numSubgroup = "0";
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/numSubgroup/);
  });

  it("rejects lesson with non-object employees element", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { employees: unknown }).employees = [null];
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/employees\[0\]/);
  });

  it("rejects malformed exam items with location in message", () => {
    const payload = buildScheduleResponse();
    (payload.exams as unknown[])[0] = { announcement: "yes" };
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/exams\[0\]\.announcement/);
  });

  it("rejects malformed nextSchedules map values", () => {
    const payload = buildScheduleResponse();
    (payload as { nextSchedules?: unknown }).nextSchedules = { Понедельник: "nope" };
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(
      /nextSchedules\.Понедельник/
    );
  });

  it("checks nested employees of a lesson against the Employee schema", () => {
    const payload = buildScheduleResponse();
    const employee = payload.schedules?.Понедельник?.[0]?.employees?.[0];
    if (employee) {
      (employee as { urlId: unknown }).urlId = 5;
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(
      "'schedules.Понедельник[0].employees[0].urlId' must be string, got number"
    );
  });

  it("checks envelope DTOs (studentGroupDto / employeeDto) field by field", () => {
    const payload = buildScheduleResponse();
    (payload as { studentGroupDto: unknown }).studentGroupDto = { name: "053503", course: "3" };
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(
      "'studentGroupDto.course' must be a finite number or null, got string"
    );
  });

  it("rejects non-object schedule day items", () => {
    const payload = buildScheduleResponse();
    (payload.schedules as unknown as Record<string, unknown>).Среда = [null];
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/schedules\.Среда\[0\]/);
  });
});
