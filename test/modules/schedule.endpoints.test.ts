import { describe, expect, it, vi } from "vitest";
import { BsuirValidationError, buildScheduleDays, createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import { minskTime } from "../helpers/minskTime";
import type { ScheduleItem } from "../../src/types/schedule";
import type { DeepMutable } from "../../src/utils/mutable";
import { buildNextTermMondayLesson, buildScheduleResponse } from "./scheduleFixtures";

const subjects = (lessons: readonly { subject: string | null }[]) => lessons.map((l) => l.subject);

function lesson(overrides: Partial<DeepMutable<ScheduleItem>>): DeepMutable<ScheduleItem> {
  return {
    weekNumber: [1],
    studentGroups: [],
    numSubgroup: 0,
    auditories: ["200-1"],
    startLessonTime: "08:00",
    endLessonTime: "09:20",
    subject: "LESSON",
    subjectFullName: "Lesson",
    note: null,
    lessonTypeAbbrev: "ЛК",
    dateLesson: null,
    startLessonDate: "01.09.2026",
    endLessonDate: "20.12.2026",
    announcement: false,
    split: false,
    employees: null,
    ...overrides
  };
}

function clientFor(...bodies: unknown[]) {
  const fetchImpl = mockFetchSequence(bodies.map((body) => createJsonResponse({ body })));
  return { client: createBsuirClient({ fetch: fetchImpl }), fetchImpl };
}

describe("schedule.getCurrentWeek", () => {
  it("parses current week from plain-text API response", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("2\n", { status: 200, headers: { "Content-Type": "text/plain" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(2);
  });
});

describe("schedule.get — target", () => {
  it("requests the group and employee endpoints", async () => {
    const { client, fetchImpl } = clientFor(buildScheduleResponse(), buildScheduleResponse());
    await client.schedule.get({ group: "053503" });
    await client.schedule.get({ employee: "s-nesterenkov" });
    expect(vi.mocked(fetchImpl).mock.calls.map(([url]) => url as string)).toEqual([
      "https://iis.bsuir.by/api/v1/schedule?studentGroup=053503",
      "https://iis.bsuir.by/api/v1/employees/schedule/s-nesterenkov"
    ]);
  });

  it("reaches employees whose live urlId contains an apostrophe", async () => {
    const { client, fetchImpl } = clientFor(buildScheduleResponse(), []);
    await client.schedule.get({ employee: "a-kuz'mich" });
    await client.announcements.byEmployee("a-kuz'mich");
    expect(vi.mocked(fetchImpl).mock.calls.map(([url]) => url as string)).toEqual([
      "https://iis.bsuir.by/api/v1/employees/schedule/a-kuz'mich",
      "https://iis.bsuir.by/api/v1/announcements/employees?url-id=a-kuz%27mich"
    ]);
  });

  it("rejects a target that is neither or both of { group } / { employee }", async () => {
    const { client, fetchImpl } = clientFor();
    for (const target of [{}, { group: "053503", employee: "s-nesterenkov" }, null]) {
      await expect(client.schedule.get(target as never)).rejects.toMatchObject({
        name: "BsuirValidationError",
        field: "target"
      });
    }
    await expect(client.schedule.getRaw({ group: "05-35" })).rejects.toMatchObject({
      field: "target.group"
    });
    await expect(client.schedule.get({ employee: "s/x" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("schedule.get — filter narrows every view", () => {
  it("returns a complete subgroup schedule, shared lessons included", async () => {
    // Fixture: Monday ООП (numSubgroup 1), Wednesday ГиЭВ (shared 0), exam ИСП (shared 0).
    const { client } = clientFor(buildScheduleResponse(), buildScheduleResponse());

    const first = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 1 } });
    expect(subjects(first.scheduleLessons)).toEqual(["ООП", "ГиЭВ"]);
    expect(subjects(first.examLessons)).toEqual(["ИСП"]);

    const second = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 2 } });
    expect(subjects(second.lessons)).toEqual(["ГиЭВ", "ИСП"]);
    expect(second.lessonsByDay.Понедельник).toEqual([]);
    // The raw-shaped maps follow the same filter.
    expect(second.schedules.Понедельник).toEqual([]);
    expect(subjects(second.schedules.Среда ?? [])).toEqual(["ГиЭВ"]);
    expect(subjects(second.exams)).toEqual(["ИСП"]);
  });

  it("applies every ScheduleFilterOptions criterion, e.g. exams only", async () => {
    const { client } = clientFor(buildScheduleResponse());
    const exams = await client.schedule.get({ group: "053503" }, { filter: { source: "exams" } });
    expect(subjects(exams.lessons)).toEqual(["ИСП"]);
    expect(exams.scheduleLessons).toEqual([]);
    expect(Object.values(exams.schedules).flat()).toEqual([]);
  });

  it("feeds date helpers directly", async () => {
    const { client } = clientFor(buildScheduleResponse());
    const mine = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 2 } });
    const days = buildScheduleDays(mine, { startDate: minskTime(2026, 4, 18), days: 7 });
    const all = days.flatMap((day) => subjects(day.lessons));
    expect(all).toContain("ГиЭВ");
    expect(all).not.toContain("ООП");
  });

  it("filters nextSchedules (map and flattened rows) with the same criteria", async () => {
    const body = buildScheduleResponse({
      nextSchedules: {
        Понедельник: [
          lesson({ subject: "NEXT-1", numSubgroup: 1 }),
          lesson({ subject: "NEXT-2", numSubgroup: 2 })
        ]
      }
    });
    const { client } = clientFor(body, body);

    const included = await client.schedule.get(
      { group: "053503" },
      { includeNextSchedules: true, filter: { subgroup: 1 } }
    );
    expect(subjects(included.nextSchedules?.Понедельник ?? [])).toEqual(["NEXT-1"]);
    expect(subjects(included.lessons)).toContain("NEXT-1");
    expect(subjects(included.lessons)).not.toContain("NEXT-2");

    // Not flattened by default (current term has lessons), but the map is still narrowed.
    const current = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 1 } });
    expect(current.lessons.some((item) => item.source === "nextSchedules")).toBe(false);
    expect(subjects(current.nextSchedules?.Понедельник ?? [])).toEqual(["NEXT-1"]);
  });

  it("decides the next-term fallback on the unfiltered current term", async () => {
    // Current term has only a subgroup-1 lesson: filtering subgroup 2 empties it, but
    // the term is not empty, so next-term rows must not be pulled in.
    const body = buildScheduleResponse({
      schedules: { Понедельник: [lesson({ subject: "CUR-1", numSubgroup: 1 })] },
      exams: [],
      nextSchedules: buildNextTermMondayLesson()
    });
    const { client } = clientFor(body);
    const filtered = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 2 } });
    expect(filtered.lessons).toEqual([]);
  });

  it("keeps next-term lessons between terms, unless opted out", async () => {
    const body = buildScheduleResponse({
      schedules: null,
      nextSchedules: buildNextTermMondayLesson()
    });
    const { client } = clientFor(body, body);

    const between = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 1 } });
    expect(
      between.lessons
        .filter((item) => item.source !== "exams")
        .map((item) => [item.subject, item.source])
    ).toEqual([["NEXT", "nextSchedules"]]);

    const optedOut = await client.schedule.get(
      { group: "053503" },
      { includeNextSchedules: false, filter: { subgroup: 1 } }
    );
    expect(optedOut.lessons.some((item) => item.source === "nextSchedules")).toBe(false);
  });

  it("validates filter criteria before requesting", async () => {
    const { client, fetchImpl } = clientFor();
    await expect(
      client.schedule.get({ group: "053503" }, { filter: { subgroup: 0 } })
    ).rejects.toBeInstanceOf(BsuirValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("schedule.getRaw", () => {
  it("returns the IIS envelope untouched (no day/source metadata, nextSchedules kept)", async () => {
    const body = buildScheduleResponse({ nextSchedules: buildNextTermMondayLesson() });
    const { client } = clientFor(body);
    const raw = await client.schedule.getRaw({ group: "053503" });
    expect(raw).toEqual(body);
    expect("lessons" in raw).toBe(false);
    expect(Object.isFrozen(raw)).toBe(true);
  });
});
