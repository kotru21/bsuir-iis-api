import { createBsuirClient } from "../../src";

const fetchImpl = (async () => new Response()) as typeof fetch;
const client = createBsuirClient({ fetch: fetchImpl });

const rawFlag: boolean = Math.random() > 0.5;

void client.schedule.getGroupBySubgroup("053503", 1, { raw: rawFlag });
void client.schedule.getEmployeeBySubgroup("s-nesterenkov", 1, { raw: rawFlag });
