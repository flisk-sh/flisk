// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const cliBin = fileURLToPath(new URL("../../../bin/tdk.js", import.meta.url));

interface InitializeResponse {
  jsonrpc: string;
  id: number;
  result: {
    capabilities: { tools: { listChanged: boolean } };
    serverInfo: { name: string; version: string };
  };
}

describe("flisk mcp over stdio", () => {
  let child: ChildProcessWithoutNullStreams | undefined;

  afterEach(() => {
    if (child?.exitCode === null && child.signalCode === null) child.kill();
    child = undefined;
  });

  it("answers initialize from the built CLI with the same request id", async () => {
    const spawned = spawn(process.execPath, [cliBin, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child = spawned;

    let stderr = "";
    spawned.stderr.setEncoding("utf8");
    spawned.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const response = new Promise<InitializeResponse>((resolve, reject) => {
      const lines = createInterface({ input: spawned.stdout });
      // The full suite runs many CLI-spawning tests in parallel, so this budget is deliberately above vitest's
      // single-test timing. A passing run answers in well under a second.
      const timeout = setTimeout(() => {
        lines.close();
        reject(new Error(`timed out waiting for initialize response; stderr: ${stderr}`));
      }, 15_000);

      spawned.once("error", (error) => {
        clearTimeout(timeout);
        lines.close();
        reject(error);
      });
      spawned.once("exit", (code, signal) => {
        clearTimeout(timeout);
        lines.close();
        reject(new Error(`flisk mcp exited before initialize: ${code ?? signal}; stderr: ${stderr}`));
      });
      lines.on("line", (line) => {
        // stdout carries only JSON-RPC messages; anything else is a protocol violation worth naming.
        let message: InitializeResponse;
        try {
          message = JSON.parse(line) as InitializeResponse;
        } catch {
          clearTimeout(timeout);
          lines.close();
          reject(new Error(`flisk mcp wrote non-JSON to stdout: ${line}; stderr: ${stderr}`));
          return;
        }
        if (message.id !== 1046) return;
        clearTimeout(timeout);
        lines.close();
        resolve(message);
      });
    });

    spawned.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1046,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke-test", version: "1.0.0" },
        },
      })}\n`,
    );

    await expect(response).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1046,
      result: {
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "flisk" },
      },
    });
  });
});
