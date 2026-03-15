import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("announcements module", () => {
  it("loads employee and department announcements", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: [{ id: 1, employee: "Нестеренков С. Н.", content: "Пересдача", studentGroups: [] }]
      }),
      createJsonResponse({
        body: [{ id: 2, employee: "Нестеренков С. Н.", content: "Консультация", studentGroups: [] }]
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const employeeAnnouncements = await client.announcements.byEmployee("s-nesterenkov");
    const departmentAnnouncements = await client.announcements.byDepartment(20027);

    expect(employeeAnnouncements).toHaveLength(1);
    expect(departmentAnnouncements).toHaveLength(1);
  });

  it("validates urlId and department id", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.announcements.byEmployee("")).rejects.toBeInstanceOf(BsuirValidationError);
    await expect(client.announcements.byDepartment(0)).rejects.toBeInstanceOf(BsuirValidationError);
  });
});
