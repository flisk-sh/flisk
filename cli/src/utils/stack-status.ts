// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { ResourceStatus, StackHealthStatus } from "../types/index.js";

/**
 * A stack with no known service status has not been checked, so it is "unknown", not "error". Once any service has a
 * status, the share of ready services decides it.
 */
export function deriveStackStatus(statuses: ResourceStatus[]): StackHealthStatus {
  if (statuses.length === 0 || statuses.every((status) => status === "unknown")) return "unknown";
  const ratio = statuses.filter((status) => status === "ready").length / statuses.length;
  if (ratio > 0.9) return "healthy";
  if (ratio > 0.5) return "degraded";
  return "error";
}
