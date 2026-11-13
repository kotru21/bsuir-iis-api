import { createBsuirClient } from "../src";

const client = createBsuirClient();

try {
  const [groups, employees, faculties] = await Promise.all([
    client.groups.listAll(),
    client.employees.listAll(),
    client.faculties.listAll()
  ]);

  // listAll returns the whole catalog: every Spring page when IIS paginates (50-page cap).
  console.log("Groups:", groups.length);
  console.log("Employees:", employees.length);
  console.log("Faculties:", faculties.length);
} catch (error: unknown) {
  console.error("Failed to list catalogs:", error);
  process.exitCode = 1;
}
