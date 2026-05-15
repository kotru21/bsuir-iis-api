import { createBsuirClient } from "../src";

const client = createBsuirClient();

const [groups, employees, faculties] = await Promise.all([
  client.groups.listAll(),
  client.employees.listAll(),
  client.faculties.listAll()
]);

// eslint-disable-next-line no-console
console.log("Groups:", groups.length);
// eslint-disable-next-line no-console
console.log("Employees:", employees.length);
// eslint-disable-next-line no-console
console.log("Faculties:", faculties.length);
