// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Golden files for the whole `runMcpCheck` report. They were captured before mcp-check.ts was split into modules, so a
// diff here means the report changed, not just where the code lives.
import { afterEach, describe, expect, it } from "vitest";
import {
  type FakeMcpServer,
  type FakeMcpServerOptions,
  startFakeMcpServer,
} from "../../test-support/fake-mcp-server.js";
import { type McpCheckOptions, runMcpCheck } from "../mcp-check.js";

let server: FakeMcpServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

// The fake server listens on a random port, so the origin is replaced before the report is compared.
async function expectGolden(
  fake: FakeMcpServerOptions,
  options: McpCheckOptions,
  file: string,
): Promise<void> {
  server = await startFakeMcpServer(fake);
  const report = await runMcpCheck(server.url, { retryDelayMs: 0, timeoutMs: 5_000, ...options });
  const text = JSON.stringify(report, null, 2).replaceAll(
    new URL(server.url).origin,
    "http://fake-mcp.test",
  );
  await expect(`${text}\n`).toMatchFileSnapshot(`./__golden__/${file}`);
}

describe("runMcpCheck golden reports", () => {
  it("a passing server, list only", async () => {
    await expectGolden({}, {}, "pass.golden.txt");
  });

  it("a passing server, with --call", async () => {
    await expectGolden({}, { call: true }, "pass-call.golden.txt");
  });

  it("a server whose tools are not read-only, with --call", async () => {
    await expectGolden({ isReadOnly: false }, { call: true }, "fail-not-read-only.golden.txt");
  });
});
