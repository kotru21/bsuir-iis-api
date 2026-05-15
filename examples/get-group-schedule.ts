import { createBsuirClient } from "../src";

const client = createBsuirClient();

const groupNumber = process.argv[2] ?? "053503";

const schedule = await client.schedule.getGroup(groupNumber);
// eslint-disable-next-line no-console
console.log(`Lessons count for ${groupNumber}:`, schedule.lessons.length);
