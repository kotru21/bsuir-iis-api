/**
 * Schedule module barrel — HTTP client module + response shaping.
 *
 * Pure filter lives in `helpers/scheduleFilter` (helpers must not import modules).
 * This barrel re-exports `filterLessons` for a stable modules entry.
 */
export { createScheduleModule } from "./scheduleApi";
export { filterLessons } from "../helpers/scheduleFilter";
export { normalizeSchedule } from "./scheduleNormalize";
