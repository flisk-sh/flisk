// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

export { buildSmokePlans, readOnlySmokePlans } from "./smoke/plans.js";
export { formatSmokeFailure } from "./smoke/report.js";
export { runSmokePlan, runSmokePlans, safeSmokeDeps } from "./smoke/run.js";
// Hub for the split in #4908: the plan schema and validation live in schema.ts, the plan catalogue in plans.ts, the
// executor in run.ts, and the failure reporting in report.ts. Importers keep importing from here; the split changes no
// behavior or public name.
export type { SmokeConfig, SmokeDeps, SmokePlan, SmokeResult, SmokeStep } from "./smoke/schema.js";
export {
  DEFAULT_SMOKE_TIMEOUT_SECONDS,
  SMOKE_RECORD_BODY_MAX_BYTES,
  validateSmoke,
} from "./smoke/schema.js";
