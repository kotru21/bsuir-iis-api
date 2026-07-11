import type { ScheduleResponse } from "../../src/types/schedule";

export function buildScheduleResponse(overrides: Partial<ScheduleResponse> = {}): ScheduleResponse {
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
              id: 536_343,
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

/** Minimal next-term Monday map for `nextSchedules` opt-in tests. */
export function buildNextTermMondayLesson(): NonNullable<ScheduleResponse["nextSchedules"]> {
  return {
    Понедельник: [
      {
        weekNumber: [1],
        studentGroups: [],
        numSubgroup: 0,
        auditories: ["200-1"],
        startLessonTime: "08:00",
        endLessonTime: "09:20",
        subject: "NEXT",
        subjectFullName: "Next term subject",
        note: null,
        lessonTypeAbbrev: "ЛК",
        dateLesson: null,
        startLessonDate: "01.09.2026",
        endLessonDate: "20.12.2026",
        announcement: false,
        split: false,
        employees: null
      }
    ]
  };
}
