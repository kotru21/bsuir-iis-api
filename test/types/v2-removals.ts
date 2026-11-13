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

// @ts-expect-error BsuirClientShape merged into BsuirClient in 3.0
import type { BsuirClientShape } from "../../src";

type GroupsModule = ReturnType<typeof createBsuirClient>["groups"];
type HasListAllPages = "listAllPages" extends keyof GroupsModule ? true : false;
// 3.0: listAll() returns every page; listAllPages() is gone.
const _listAllPagesRemoved: HasListAllPages extends false ? true : never = true;

// Keep bindings referenced so verbatimModuleSyntax accepts the negative imports.
type _RemovedSurface = [
  ApiDateResponse,
  RequestOptions,
  QueryParams,
  QueryValue,
  RequestMethod,
  BsuirClientShape
];
void 0 as unknown as _RemovedSurface;
