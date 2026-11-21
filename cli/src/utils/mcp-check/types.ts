// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

export type JsonObject = Record<string, unknown>;

export interface McpCheckResult {
  check: string;
  didPass: boolean;
  /** True when the check did not run (for example tools/call without --call); a skipped check never fails. */
  isSkipped?: boolean;
  detail: string;
}

export interface McpCheckReport {
  url: string;
  iconUrl: string | null;
  serverName: string | null;
  didPass: boolean;
  failures: number;
  checks: McpCheckResult[];
}

export interface McpCheckOptions {
  /** Call every tool once with arguments built from its inputSchema. Off by default. */
  call?: boolean;
  /** Check that icon-512.png next to the endpoint is a PNG. On by default. */
  icon?: boolean;
  userAgent?: string;
  timeoutMs?: number;
  /** Delay before each of the two retries of a request that failed with a network error. */
  retryDelayMs?: number;
}