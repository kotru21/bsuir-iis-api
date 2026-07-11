import { expect, it } from "vitest";
import { BsuirApiError } from "../../../src/client/errors";
import { createLiveClient } from "./client";
import { LIVE_DEPARTMENT_ID, LIVE_EMPLOYEE_URL_ID } from "./fixtures";
import { describeLive } from "./gate";

describeLive("live announcements contract", () => {
  const client = createLiveClient();

  it("byEmployee / byDepartment return arrays (400/422 department → [])", async () => {
    const employeeAnnouncements = await client.announcements.byEmployee(LIVE_EMPLOYEE_URL_ID);

    let departmentAnnouncements: unknown;
    try {
      departmentAnnouncements = await client.announcements.byDepartment(LIVE_DEPARTMENT_ID);
    } catch (error) {
      if (error instanceof BsuirApiError && [400, 422].includes(error.status)) {
        departmentAnnouncements = [];
      } else {
        throw error;
      }
    }

    expect(Array.isArray(employeeAnnouncements)).toBe(true);
    expect(Array.isArray(departmentAnnouncements)).toBe(true);
  }, 60_000);

  it("announcements endpoints return array or Spring page; SDK yields array", async () => {
    const baseUrl = "https://iis.bsuir.by/api/v1";
    const rawEmployeeUrl = `${baseUrl}/announcements/employees?url-id=${LIVE_EMPLOYEE_URL_ID}`;
    let capturedTotalElements: number | undefined;

    const rawResponse = await fetch(rawEmployeeUrl, {
      headers: { Accept: "application/json" }
    });
    expect(rawResponse.ok || rawResponse.status === 404).toBe(true);

    if (rawResponse.ok) {
      const rawPayload: unknown = await rawResponse.json();
      const isArray = Array.isArray(rawPayload);
      const isPage =
        typeof rawPayload === "object" &&
        rawPayload !== null &&
        Array.isArray((rawPayload as { content?: unknown }).content);
      expect(isArray || isPage).toBe(true);

      if (isPage) {
        const page = rawPayload as {
          content: unknown[];
          totalPages?: number;
          totalElements?: number;
          last?: boolean;
        };
        expect(page.content).toEqual(expect.any(Array));
        if (typeof page.totalPages === "number") {
          expect(page.totalPages).toBeGreaterThanOrEqual(1);
        }
        if (typeof page.totalElements === "number") {
          capturedTotalElements = page.totalElements;
        }
        if (page.last === false || (typeof page.totalPages === "number" && page.totalPages > 1)) {
          expect(page.content.length).toBeGreaterThan(0);
        }
      } else if (isArray) {
        capturedTotalElements = rawPayload.length;
      }
    }

    const pagedUrl = `${baseUrl}/announcements/employees?url-id=${LIVE_EMPLOYEE_URL_ID}&page=0&size=5`;
    const pagedResponse = await fetch(pagedUrl, {
      headers: { Accept: "application/json" }
    });
    if (pagedResponse.ok) {
      const pagedPayload: unknown = await pagedResponse.json();
      if (
        typeof pagedPayload === "object" &&
        pagedPayload !== null &&
        Array.isArray((pagedPayload as { content?: unknown }).content)
      ) {
        const page = pagedPayload as {
          content: unknown[];
          totalPages?: number;
          last?: boolean;
        };
        expect(page.content.length).toBeGreaterThan(0);
        expect(page.content.length).toBeLessThanOrEqual(5);
        if (typeof page.totalPages === "number" && page.totalPages > 1) {
          expect(page.last).toBe(false);
          const page1Url = `${baseUrl}/announcements/employees?url-id=${LIVE_EMPLOYEE_URL_ID}&page=1&size=5`;
          const page1Response = await fetch(page1Url, {
            headers: { Accept: "application/json" }
          });
          expect(page1Response.ok).toBe(true);
          const page1Payload: unknown = await page1Response.json();
          expect(Array.isArray((page1Payload as { content?: unknown }).content)).toBe(true);
        }
      }
    }

    const viaSdk = await client.announcements.byEmployee(LIVE_EMPLOYEE_URL_ID);
    expect(Array.isArray(viaSdk)).toBe(true);
    if (typeof capturedTotalElements === "number") {
      expect(viaSdk.length).toBe(capturedTotalElements);
    }
  }, 60_000);

  // Documented skip: live IIS does not expose a stably reproducible empty/404
  // announcements id for weekly CI. Re-enable only when a fixed probe id is known.
  it.skip("treat404AsEmpty: false surfaces BsuirApiError on known-empty id", async () => {
    await expect(
      client.announcements.byEmployee("__no-such-employee-url-id__", {
        treat404AsEmpty: false
      })
    ).rejects.toBeInstanceOf(BsuirApiError);
  });
});
