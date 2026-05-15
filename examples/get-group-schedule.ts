import { createBsuirClient } from "../src";

const client = createBsuirClient();

const groupNumber = process.argv[2] ?? "053503";

try {
  const schedule = await client.schedule.getGroup(groupNumber);
  console.log(`Lessons count for ${groupNumber}:`, schedule.lessons.length);
} catch (error: unknown) {
  console.error("Failed to fetch group schedule:", error);
  process.exitCode = 1;
}
