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
  it("catalog listAll skips array check when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.groups.listAll()).resolves.toEqual({ not: "array" });
  });

  it("catalog listAll enforces array check when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("announcements skip array check when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.announcements.byEmployee("v-petrov")).resolves.toEqual({ not: "array" });
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

  it("announcements enforce array check when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
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

  it("schedule getGroupRaw skips envelope check when validateResponses is false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { schedules: [] } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroupRaw("053503")).resolves.toMatchObject({
      schedules: []
    });
  });

  it("schedule getGroupRaw enforces envelope check when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { schedules: [] } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("schedule getGroupRaw accepts valid envelope when validateResponses is true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: validScheduleBody })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.schedule.getGroupRaw("053503")).resolves.toMatchObject({
      schedules: {}
    });
  });
});
