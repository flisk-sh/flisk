// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { JsonObject } from "./types.js";

export function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}