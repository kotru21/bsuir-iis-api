import { describe, expect, it } from "vitest";
import { BsuirResponseValidationError, createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

const validScheduleBody = {
  employeeDto: null,
  studentGroupDto: null,
  schedules: {},
  exams: [],
  startDate: null,
  endDate: null,
  startExamsDate: null,
  endExamsDate: null
};

describe("validateResponses contract", () => {
  it("catalog listAll always enforces Array.isArray after unwrap", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { not: "array" } }),
      createJsonResponse({ body: { not: "array" } })
    ]);
    const loose = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(loose.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);

    const strict = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(strict.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("catalog listAll unwraps paginated envelope when validateResponses is true", async () => {
    const items = [{ id: 1, name: "x" }];
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { content: items, totalElements: 1 } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.groups.listAll()).resolves.toEqual(items);
  });

  it("announcements always enforce Array.isArray after unwrap", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { not: "array" } }),
      createJsonResponse({ body: { not: "array" } })
    ]);
    const loose = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(loose.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );

    const strict = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(strict.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("announcements unwrap paginated envelope when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { content: [{ id: 1, content: "test" }], totalElements: 1 } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.announcements.byEmployee("v-petrov")).resolves.toEqual([
      { id: 1, content: "test" }
    ]);
  });

  it("announcements accept paginated envelope when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { content: [{ id: 1, content: "test" }], totalElements: 1 } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.announcements.byEmployee("v-petrov")).resolves.toEqual([
      { id: 1, content: "test" }
    ]);
  });

  it("schedule getGroupRaw enforces structural envelope when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { schedules: [] } }),
      createJsonResponse({ body: { schedules: {}, nextSchedules: [] } }),
      createJsonResponse({ body: { schedules: {}, exams: {} } }),
      createJsonResponse({
        body: { schedules: { Понедельник: "bad" }, exams: [] }
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("schedule getGroup enforces structural envelope when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { schedules: [] } }),
      createJsonResponse({
        body: { schedules: { Понедельник: "bad" }, exams: [] }
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroup("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    await expect(client.schedule.getGroup("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("schedule getGroupRaw enforces deep envelope check when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { schedules: [] } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("schedule getGroupRaw accepts valid envelope when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: validScheduleBody })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroupRaw("053503")).resolves.toMatchObject({
      schedules: {}
    });
  });

  it("schedule getGroupRaw accepts valid envelope when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: validScheduleBody })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.schedule.getGroupRaw("053503")).resolves.toMatchObject({
      schedules: {}
    });
  });
});
