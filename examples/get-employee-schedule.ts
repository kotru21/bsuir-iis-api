import { createBsuirClient } from "../src";

const client = createBsuirClient();

const urlId = process.argv[2] ?? "s-nesterenkov";

try {
  const schedule = await client.schedule.getEmployee(urlId);
  console.log(`Lessons count for ${urlId}:`, schedule.lessons.length);
} catch (error: unknown) {
  console.error("Failed to fetch employee schedule:", error);
  process.exitCode = 1;
}
