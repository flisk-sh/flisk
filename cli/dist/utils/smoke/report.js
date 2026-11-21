// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export function formatSmokeFailure(result) {
    return `Smoke check failed: ${result.failure}${result.recordPath ? ` (record: ${result.recordPath})` : ""}`;
}
