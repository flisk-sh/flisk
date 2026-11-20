// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it } from "vitest";
import { createTempDir, runFlisk } from "../../test-support/index.js";
import { logsCommand } from "../logs.js";

it("shows examples in logs help", () => {
  let help = "";
  logsCommand.configureOutput({ writeOut: (text) => (help += text) });
  logsCommand.outputHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk logs --tail 50");
});

it("describes service names and the Docker-only Tilt port", () => {
  let help = "";
  logsCommand.configureOutput({ writeOut: (text) => (help += text) });
  logsCommand.outputHelp();
  expect(help).toContain("names as in flisk resources");
  expect(help).toContain("Tilt UI port for Docker runtime");
  expect(help.replace(/\s+/g, " ")).toContain("saved port");
});

it("documents --source", () => {
  let help = "";
  logsCommand.configureOutput({ writeOut: (text) => (help += text) });
  logsCommand.outputHelp();
  expect(help).toContain("--source <source>");
  expect(help).toContain("flisk logs --service orders-api --source runtime --json");
});

it("documents --run for reading one run of a local service", () => {
  let help = "";
  logsCommand.configureOutput({ writeOut: (text) => (help += text) });
  logsCommand.outputHelp();
  expect(help).toContain("--run <run>");
  expect(help).toContain("flisk logs --service orders-api --run previous");
});

it("gives a snapshot hint for follow and reserves the positional hint for names", () => {
  const cwd = createTempDir("logs-options");
  const run = (...args: string[]) => runFlisk(["logs", ...args], { cwd });
  const follow = run("-f");
  expect(follow.status).toBe(1);
  expect(follow.stdout + follow.stderr).toContain("live follow is not supported");
  const unknown = run("--unknown");
  expect(unknown.stdout + unknown.stderr).not.toContain("Service names are not positional");
  const positional = run("api");
  expect(positional.stdout + positional.stderr).toContain("Service names are not positional");
});
