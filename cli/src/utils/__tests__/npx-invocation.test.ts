// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/temp-project.js";
import { npxInvocation, quoteCmdArgument } from "../npx-invocation.js";

const NODE_DIR = "C:\\Program Files\\nodejs";
const NODE_EXE = `${NODE_DIR}\\node.exe`;
const NPX_CLI = `${NODE_DIR}\\node_modules\\npm\\bin\\npx-cli.js`;

/** Arguments that cmd.exe would split, expand or run as a second command when joined unquoted (#4004). */
const HOSTILE_ARGS = [
  "C:\\Users\\Jane Smith\\shop",
  "build&echo PWNED",
  "a|b",
  "%PATH%",
  "x^y",
  'say "hi"',
  "trailing\\",
  "<in>",
  "wow!",
  "",
];

describe("npxInvocation", () => {
  it("runs npx as is outside Windows", () => {
    expect(npxInvocation(["--yes", "pkg", "a b"], { platform: "linux" })).toEqual({
      command: "npx",
      args: ["--yes", "pkg", "a b"],
      shell: false,
      windowsVerbatimArguments: false,
    });
  });

  it("runs npm's npx-cli.js with node.exe on Windows, so no shell sees the arguments", () => {
    const invocation = npxInvocation(["--yes", "pkg", ...HOSTILE_ARGS], {
      platform: "win32",
      execPath: NODE_EXE,
      exists: (path) => path === NPX_CLI,
    });
    expect(invocation).toEqual({
      command: NODE_EXE,
      args: [NPX_CLI, "--yes", "pkg", ...HOSTILE_ARGS],
      shell: false,
      windowsVerbatimArguments: false,
    });
  });

  it("does not look for npx-cli.js next to an executable that is not node (the flisk binary, bun)", () => {
    for (const execPath of ["C:\\tools\\flisk.exe", "C:\\bun\\bun.exe"]) {
      const invocation = npxInvocation(["--yes", "pkg"], {
        platform: "win32",
        execPath,
        exists: () => true,
        comSpec: "C:\\Windows\\system32\\cmd.exe",
      });
      expect(invocation.command).toBe("C:\\Windows\\system32\\cmd.exe");
    }
  });

  it("falls back to npx.cmd through cmd.exe with every argument quoted", () => {
    const invocation = npxInvocation(["--yes", "pkg", "C:\\Users\\Jane Smith\\shop", "a&b"], {
      platform: "win32",
      execPath: NODE_EXE,
      exists: () => false,
      comSpec: "C:\\Windows\\system32\\cmd.exe",
    });
    expect(invocation).toEqual({
      command: "C:\\Windows\\system32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        `"npx.cmd ${["--yes", "pkg", "C:\\Users\\Jane Smith\\shop", "a&b"].map(quoteCmdArgument).join(" ")}"`,
      ],
      shell: false,
      windowsVerbatimArguments: true,
    });
  });
});

describe("quoteCmdArgument", () => {
  it("quotes and caret-escapes cmd.exe metacharacters for a batch file", () => {
    expect(quoteCmdArgument("plain")).toBe('^^^"plain^^^"');
    expect(quoteCmdArgument("a b")).toBe('^^^"a^^^ b^^^"');
    expect(quoteCmdArgument("a&b")).toBe('^^^"a^^^&b^^^"');
    expect(quoteCmdArgument("%PATH%")).toBe('^^^"^^^%PATH^^^%^^^"');
    expect(quoteCmdArgument('say "hi"')).toBe('^^^"say^^^ \\^^^"hi\\^^^"^^^"');
    expect(quoteCmdArgument("trailing\\")).toBe('^^^"trailing\\\\^^^"');
  });

  // The real check: what a batch file (like npx.cmd) hands to node after cmd.exe has parsed the line.
  it.runIf(process.platform === "win32")(
    "survives cmd.exe and a batch file unchanged on Windows",
    () => {
      const dir = createTempDir("flisk-npx-quote-");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "echo.js"),
        "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
      );
      writeFileSync(join(dir, "echo.cmd"), '@node "%~dp0echo.js" %*\r\n');
      const marker = join(dir, "marker.txt");
      const args = [...HOSTILE_ARGS, `x&echo PWNED>"${marker}"`];
      const line = `"${join(dir, "echo.cmd")} ${args.map(quoteCmdArgument).join(" ")}"`;
      const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", line], {
        windowsVerbatimArguments: true,
        encoding: "utf8",
      });
      expect(JSON.parse(result.stdout)).toEqual(args);
      expect(spawnSync("cmd.exe", ["/d", "/c", `if exist "${marker}" exit 1`]).status).toBe(0);
    },
  );
});
