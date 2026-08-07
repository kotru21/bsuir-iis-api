import type { createBsuirClient } from "../../src";

// @ts-expect-error ApiDateResponse removed from the public surface in 2.0
import type { ApiDateResponse } from "../../src";
// @ts-expect-error RequestOptions removed from the public surface in 2.0
import type { RequestOptions } from "../../src";
// @ts-expect-error QueryParams removed from the public surface in 2.0
import type { QueryParams } from "../../src";
// @ts-expect-error QueryValue removed from the public surface in 2.0
import type { QueryValue } from "../../src";
// @ts-expect-error RequestMethod removed from the public surface in 2.0
import type { RequestMethod } from "../../src";

type ScheduleModule = ReturnType<typeof createBsuirClient>["schedule"];

type HasLastUpdateByGroup = "getLastUpdateByGroup" extends keyof ScheduleModule ? true : false;
type HasLastUpdateByEmployee = "getLastUpdateByEmployee" extends keyof ScheduleModule
  ? true
  : false;

const _lastUpdateByGroupRemoved: HasLastUpdateByGroup extends false ? true : never = true;
const _lastUpdateByEmployeeRemoved: HasLastUpdateByEmployee extends false ? true : never = true;
void _lastUpdateByGroupRemoved;
void _lastUpdateByEmployeeRemoved;

// Keep bindings referenced so verbatimModuleSyntax accepts the negative imports.
type _RemovedSurface = [ApiDateResponse, RequestOptions, QueryParams, QueryValue, RequestMethod];
void 0 as unknown as _RemovedSurface;
