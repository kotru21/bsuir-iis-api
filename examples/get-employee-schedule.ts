import { createBsuirClient } from "../src";

const client = createBsuirClient();

const urlId = process.argv[2] ?? "s-nesterenkov";

async function main(): Promise<void> {
  const schedule = await client.schedule.getEmployee(urlId);
  console.log(`Lessons count for ${urlId}:`, schedule.lessons.length);
}

void main();
