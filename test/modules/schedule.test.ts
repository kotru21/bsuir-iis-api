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
          numSubgroup: 1,
          auditories: ["101-1"],
          startLessonTime: "09:00",
          endLessonTime: "10:20",
          subject: "ООП",
          subjectFullName: "Объектно-ориентированное программирование",
          note: "английский",
          lessonTypeAbbrev: "ЛР",
          dateLesson: null,
          startLessonDate: "10.02.2026",
          endLessonDate: "30.05.2026",
          announcement: false,
          split: false,
          employees: [
            {
              firstName: "Вадим",
              lastName: "Владымцев",
              middleName: "Денисович",
              degree: "",
              degreeAbbrev: "",
              email: null,
              rank: null,
              photoLink: "https://iis.bsuir.by/api/v1/employees/photo/536343",
              calendarId: "k2ecr5nj6j3m45f3pk31ji7l1s@group.calendar.google.com",
              id: 536343,
              urlId: "v-vladymtsev",
              jobPositions: null
            }
          ]
        }
      ],
      Среда: [
        {
          weekNumber: [2],
          studentGroups: [],
          numSubgroup: 0,
          auditories: ["322а-5 к."],
          startLessonTime: "14:00",
          endLessonTime: "15:20",
          subject: "ГиЭВ",
          subjectFullName: "Генетические и эволюционные вычисления",
          note: null,
          lessonTypeAbbrev: "ЛК",
          dateLesson: "23.05.2026",
          startLessonDate: null,
          endLessonDate: null,
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
        lessonTypeAbbrev: "Экзамен",
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
      expect(response.lessons).toHaveLength(3);
      expect(response.scheduleLessons).toHaveLength(2);
      expect(response.examLessons).toHaveLength(1);
      expect(response.lessonsByDay.Понедельник).toHaveLength(1);
      expect(response.lessonsByDay.Среда).toHaveLength(1);
      expect(response.lessons[2]?.source).toBe("exams");
      expect(response.lessons[2]?.day).toBeNull();
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
    expect("lessons" in response && response.lessons.some((item) => item.employees === null)).toBe(true);
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

  it("supports filtered schedule queries", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "exams",
      lessonTypeAbbrev: "Экзамен"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.source).toBe("exams");
    expect(filtered[0]?.lessonTypeAbbrev).toBe("Экзамен");
  });

  it("handles schedules=null in raw response and normalizes safely", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: null,
          exams: []
        })
      }),
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: null,
          exams: []
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const raw = await client.schedule.getGroup("053503", { raw: true });
    const normalized = await client.schedule.getGroup("053503");

    expect(raw.schedules).toBeNull();
    expect(normalized.schedules).toEqual({});
    expect(normalized.lessons).toEqual([]);
  });

  it("supports filtering by weekday and employee", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      weekday: "Понедельник",
      employeeUrlId: "v-vladymtsev",
      subjectQuery: "английский"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.day).toBe("Понедельник");
    expect(filtered[0]?.employees?.[0]?.urlId).toBe("v-vladymtsev");
  });

  it("exposes exams and subgroup helper methods", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: buildScheduleResponse() }),
      createJsonResponse({ body: buildScheduleResponse() })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const exams = await client.schedule.getGroupExams("053503");
    const subgroupLessons = await client.schedule.getGroupBySubgroup("053503", 1);

    expect(exams).toHaveLength(1);
    expect(exams[0]?.source).toBe("exams");
    expect(subgroupLessons).toHaveLength(1);
    expect(subgroupLessons[0]?.numSubgroup).toBe(1);
  });

  it("returns current cycle week from schedule module", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: 3 }),
      createJsonResponse({ body: 3 })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const cycleWeek = await client.schedule.getCurrentCycleWeek();
    const customCycleWeek = await client.schedule.getCurrentCycleWeek({ weeksPerCycle: 1 });
    expect(cycleWeek).toBe(2);
    expect(customCycleWeek).toBe(3);
  });

  it("returns empty normalized arrays for empty schedules", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: {},
          exams: []
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const response = await client.schedule.getGroup("053503");
    expect(response.lessons).toHaveLength(0);
    expect(response.scheduleLessons).toHaveLength(0);
    expect(response.examLessons).toHaveLength(0);
  });

  it("supports combined schedule filters", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      weekNumber: 1,
      subgroup: 1,
      lessonTypeAbbrev: ["ЛР", "ЛК"],
      auditory: "101-1"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.subject).toBe("ООП");
  });

  it("handles nullable weekNumber and lessonTypeAbbrev safely", async () => {
    const payload = buildScheduleResponse();
    payload.schedules!.Понедельник![0]!.weekNumber = null;
    payload.schedules!.Понедельник![0]!.lessonTypeAbbrev = null;

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      weekNumber: 1,
      lessonTypeAbbrev: "ЛР"
    });

    expect(filtered).toHaveLength(0);
  });
});
