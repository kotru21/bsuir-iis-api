import { createBsuirClient } from "../src";

const client = createBsuirClient();

try {
  const [groups, employees, faculties] = await Promise.all([
    client.groups.listAll(),
    client.employees.listAll(),
    client.faculties.listAll()
  ]);

  // listAll = first Spring page only; listAllPages = all pages (50-page safety cap)
  const allGroups = await client.groups.listAllPages();

  console.log("Groups (first page):", groups.length);
  console.log("Groups (all pages):", allGroups.length);
  console.log("Employees:", employees.length);
  console.log("Faculties:", faculties.length);
} catch (error: unknown) {
  console.error("Failed to list catalogs:", error);
  process.exitCode = 1;
}
