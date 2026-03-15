import { createBsuirClient } from "../src";

const client = createBsuirClient();

const urlId = process.argv[2] ?? "s-nesterenkov";

async function main(): Promise<void> {
  const schedule = await client.schedule.getEmployee(urlId);
  if ("lessons" in schedule) {
    console.log(`Lessons count for ${urlId}:`, schedule.lessons.length);
  } else {
    console.log(`Exams count for ${urlId}:`, schedule.exams.length);
  }
}

void main();
