// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { portConflictFix } from "../port-conflict-fix.js";

describe("portConflictFix", () => {
  it("names the env var that moves a known Flisk port", () => {
    expect(portConflictFix("host port 5432 is already allocated")).toBe(
      "Fix: stop the process using port 5432 (find it with: lsof -nP -iTCP:5432 -sTCP:LISTEN), or set TDK_POSTGRES_PORT to a free port and run flisk up",
    );
  });

  it("maps the ingress ports to their env vars", () => {
    expect(portConflictFix("host port 80 is already allocated")).toContain("TDK_HTTP_PORT");
    expect(portConflictFix("host port 443 is already allocated")).toContain("TDK_HTTPS_PORT");
  });

  it("gives only the way to find the holder for other ports", () => {
    expect(portConflictFix("host port 9000 is already allocated")).toBe(
      "Fix: stop the process using port 9000 (find it with: lsof -nP -iTCP:9000 -sTCP:LISTEN)",
    );
  });

  it("reads the raw Docker bind error too", () => {
    expect(portConflictFix("Bind for 0.0.0.0:5432 failed: port is already allocated")).toContain(
      "TDK_POSTGRES_PORT",
    );
  });

  it("gives no next step when the port is not known", () => {
    expect(portConflictFix("a required host port is already allocated")).toBeNull();
  });

  it("gives no next step for other failures", () => {
    expect(portConflictFix("ConnectionRefused downloading package manifest")).toBeNull();
  });
});
