import { createBsuirClient } from "../src";

const client = createBsuirClient();

const groupNumber = process.argv[2] ?? "053503";

async function main(): Promise<void> {
  const schedule = await client.schedule.getGroup(groupNumber);
  console.log(`Lessons count for ${groupNumber}:`, schedule.lessons.length);
}

void main();
