import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import type { ScheduleResponse } from "../../src/types/schedule";

function buildScheduleResponse(overrides: Partial<ScheduleResponse> = {}): ScheduleResponse {
  return {
    employeeDto: null,
    studentGroupDto: null,
    schedules: {
      Понедельник: [
        {
          weekNumber: [1],
          studentGroups: [],
          numSubgroup: 0,
          auditories: ["101-1"],
          startLessonTime: "09:00",
          endLessonTime: "10:20",
          subject: "ООП",
          subjectFullName: "Объектно-ориентированное программирование",
          note: null,
          lessonTypeAbbrev: "ЛР",
          dateLesson: null,
          startLessonDate: "10.02.2026",
          endLessonDate: "30.05.2026",
          announcement: false,
          split: false,
          employees: null
        }
      ]
    },
    exams: [
      {
        weekNumber: [2],
        studentGroups: [],
        numSubgroup: 0,
        auditories: ["112-4 к."],
        startLessonTime: "15:00",
        endLessonTime: "16:00",
        subject: "ИСП",
        subjectFullName: "Инструменты и средства программирования",
        note: null,
        lessonTypeAbbrev: "Консультация",
        dateLesson: "14.06.2026",
        startLessonDate: null,
        endLessonDate: null,
        announcement: false,
        split: false,
        employees: null
      }
    ],
    startDate: "09.02.2026",
    endDate: "07.06.2026",
    startExamsDate: "14.06.2026",
    endExamsDate: "02.07.2026",
    ...overrides
  };
}

describe("schedule module", () => {
  it("returns normalized schedule by default", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const response = await client.schedule.getGroup("053503");

    expect("lessons" in response).toBe(true);
    if ("lessons" in response) {
      expect(response.lessons).toHaveLength(2);
      expect(response.lessons[1]?.source).toBe("exams");
      expect(response.lessons[1]?.day).toBeNull();
    }
  });

  it("supports raw mode per request", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const response = await client.schedule.getGroup("053503", { raw: true });

    expect("lessons" in response).toBe(false);
    expect(response.exams).toHaveLength(1);
  });

  it("handles employee schedule where lesson employees can be null", async () => {
    const payload = buildScheduleResponse({ employeeDto: null });
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const response = await client.schedule.getEmployee("s-nesterenkov");
    expect("lessons" in response && response.lessons[0]?.employees).toBeNull();
  });

  it("throws on invalid group number", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.schedule.getGroup("")).rejects.toBeInstanceOf(BsuirValidationError);
  });

  it("supports last update endpoints", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { lastUpdateDate: "23.02.2022" } }),
      createJsonResponse({ body: { lastUpdateDate: "24.02.2022" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const byGroup = await client.schedule.getLastUpdateByGroup({ groupNumber: "053503" });
    const byEmployee = await client.schedule.getLastUpdateByEmployee({ id: 123 });

    expect(byGroup.lastUpdateDate).toBe("23.02.2022");
    expect(byEmployee.lastUpdateDate).toBe("24.02.2022");
  });
});
