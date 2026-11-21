// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { SmokeResult } from "./schema.js";

export function formatSmokeFailure(result: SmokeResult): string {
  return `Smoke check failed: ${result.failure}${result.recordPath ? ` (record: ${result.recordPath})` : ""}`;
}
