import { assertPositiveInt } from "./guards";

const CYCLE_LENGTH = 4;

/**
 * Converts semester week number to BSUIR cycle week (1..4).
 * For default configuration weeks 1-2 => 1, 3-4 => 2, 5-6 => 3, 7-8 => 4.
 */
export function toCycleWeek(semesterWeek: number, weeksPerCycle = 2): number {
  assertPositiveInt(semesterWeek, "semesterWeek");
  assertPositiveInt(weeksPerCycle, "weeksPerCycle");

  return (Math.floor((semesterWeek - 1) / weeksPerCycle) % CYCLE_LENGTH) + 1;
}
