import { createBsuirClient } from "../src";

const client = createBsuirClient();

const urlId = process.argv[2] ?? "s-nesterenkov";

const schedule = await client.schedule.getEmployee(urlId);
// eslint-disable-next-line no-console
console.log(`Lessons count for ${urlId}:`, schedule.lessons.length);
