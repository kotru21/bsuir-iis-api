/**
 * Schedule module barrel — HTTP client module + response shaping only.
 *
 * Pure day/time helpers live in `helpers/schedule`; formatters in
 * `helpers/scheduleFormat`. Package root re-exports each from its owning layer.
 */
export { createScheduleModule } from "./scheduleApi";
export { filterLessons } from "./scheduleFilter";
export { normalizeSchedule } from "./scheduleNormalize";
