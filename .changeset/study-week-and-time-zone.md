---
"bsuir-iis-api": minor
---

Fix study-week and time-zone handling in schedule date helpers.

- The study week (1–4) is now derived from the BSUIR academic calendar — week 1 is the Monday–Sunday week containing 1 September and weeks change on Mondays — instead of counting 7-day blocks from `startDate`. The old count picked the wrong week whenever `startDate` was not a Monday (e.g. autumn 2026 groups start on Tuesday 01.09.2026, so every Monday showed the previous week; employee schedules use their first lesson date).
- New `currentWeek` / `now` options on `getLessonsForDate`, `getTodayLessons`, `getTomorrowLessons` and `buildScheduleDays` anchor week numbers to `client.schedule.getCurrentWeek()`.
- Date helpers and `getCurrentLesson` / `getNextLesson` now read instants in `Europe/Minsk` by default (new `timeZone` option), so servers running in UTC no longer shift "today" and the current lesson by three hours. Pass `timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone` for the previous local-time behavior.
- Next-term lessons flattened between terms are no longer dropped by date helpers.
- New exports: `getStudyWeek`, `BSUIR_TIME_ZONE`, `StudyWeekOptions`, `ScheduleTimeZoneOptions`, `LessonTimeOptions`; `ScheduleDay` gains `weekNumber`.
