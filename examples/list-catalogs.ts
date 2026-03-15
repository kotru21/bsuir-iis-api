import { createBsuirClient } from "../src";

const client = createBsuirClient();

async function main(): Promise<void> {
  const [groups, employees, faculties] = await Promise.all([
    client.groups.listAll(),
    client.employees.listAll(),
    client.faculties.listAll()
  ]);

  console.log("Groups:", groups.length);
  console.log("Employees:", employees.length);
  console.log("Faculties:", faculties.length);
}

void main();
