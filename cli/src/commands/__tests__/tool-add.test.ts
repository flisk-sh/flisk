// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { FRONTEND_FRAMEWORKS } from "../../frontend-frameworks/registry.js";
import { DATABASE_FRAMEWORKS } from "../../types/index.js";
import { FliskError } from "../../utils/errors.js";
import { findTool, resourceArgs, TOOL_CATALOG, toolKey } from "../../utils/tool-catalog.js";
import { getRegisteredCommands } from "../registry.js";
import { addTool, formatToolList, runResource } from "../tool.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function quiet(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    lines.push(args.map(String).join(" "));
  });
  return lines;
}

describe("tool catalog", () => {
  it("finds a tool the way people write it", () => {
    expect(findTool("Next.js")?.id).toBe("nextjs");
    expect(findTool("Spring Boot")?.id).toBe("spring-boot");
    expect(findTool("Node.js")?.id).toBe("nodejs");
    expect(findTool("PostgreSQL")?.id).toBe("postgresql");
    expect(findTool("postgres")?.id).toBe("postgresql");
    expect(findTool("LLM APIs")?.id).toBe("llm-api");
    expect(findTool("Google Cloud")?.id).toBe("google-cloud");
    expect(findTool("GitHub Actions")?.id).toBe("github-actions");
    expect(findTool("Jutro Digital")?.id).toBe("jutro");
    expect(findTool("PolicyCenter")?.id).toBe("policycenter");
    expect(findTool("cobol")).toBeUndefined();
    expect(findTool("...")).toBeUndefined();
  });

  it("gives every id and alias exactly one tool", () => {
    const seen = new Map<string, string>();
    for (const tool of TOOL_CATALOG) {
      for (const key of [tool.id, ...tool.aliases].map(toolKey)) {
        expect(
          seen.get(key),
          `${key} is claimed by ${seen.get(key)} and ${tool.id}`,
        ).toBeUndefined();
        seen.set(key, tool.id);
      }
    }
  });

  it("maps resource tools only to frameworks the generators have", () => {
    for (const tool of TOOL_CATALOG) {
      if (tool.status !== "resource") continue;
      const type = tool.args[tool.args.indexOf("--type") + 1];
      const framework = tool.args.includes("--framework")
        ? tool.args[tool.args.indexOf("--framework") + 1]
        : undefined;
      if (type === "frontend") expect(Object.keys(FRONTEND_FRAMEWORKS)).toContain(framework);
      if (type === "database")
        expect(DATABASE_FRAMEWORKS as readonly string[]).toContain(framework);
    }
  });

  it("rejects every cloud provider", () => {
    for (const id of ["aws", "google-cloud", "gcp", "azure", "kubernetes"]) {
      expect(findTool(id)?.status).toBe("rejected");
    }
  });

  it("builds the flisk resource arguments with a default name, forwarding --stack only when given", () => {
    const react = findTool("react");
    if (react?.status !== "resource") throw new Error("react should add a resource");
    expect(resourceArgs(react, {})).toEqual([
      "resource",
      "web",
      "--type",
      "frontend",
      "--framework",
      "react",
      "--yes",
    ]);
    expect(resourceArgs(react, { name: "shop", stack: "store", dryRun: true, json: true })).toEqual(
      [
        "resource",
        "shop",
        "--type",
        "frontend",
        "--framework",
        "react",
        "--stack",
        "store",
        "--yes",
        "--dry-run",
        "--json",
      ],
    );
  });
});

describe("flisk tool add", () => {
  it("is a registered command", () => {
    expect(getRegisteredCommands().map((command) => command.name())).toContain("tool");
  });

  it("lists every tool when no tool is given", () => {
    const lines = quiet();
    addTool(undefined, undefined, {});
    expect(lines.join("\n")).toBe(formatToolList().join("\n"));
    for (const tool of TOOL_CATALOG) expect(lines.join("\n")).toContain(tool.id);
  });

  it("runs flisk resource for a tool Flisk generates", () => {
    quiet();
    const run = vi.fn(() => undefined);
    addTool("FastAPI", "orders", { stack: "shop" }, run);
    expect(run).toHaveBeenCalledWith(
      [
        "resource",
        "orders",
        "--type",
        "backend",
        "--language",
        "python",
        "--stack",
        "shop",
        "--yes",
      ],
      false,
    );
  });

  it("returns the resource envelope with --json", () => {
    const run = vi.fn(() => ({ name: "db" }));
    const result = addTool("postgres", undefined, { json: true }, run);
    expect(result).toMatchObject({
      id: "postgresql",
      status: "resource",
      resource: { name: "db" },
    });
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["--json"]), true);
  });

  it("rejects Google Cloud and AWS with exit 1 and local alternatives", () => {
    const run = vi.fn();
    for (const input of ["google cloud", "AWS"]) {
      let error: unknown;
      try {
        addTool(input, undefined, {}, run);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(FliskError);
      expect((error as FliskError).exitCode).toBe(1);
      expect((error as FliskError).message).toMatch(/never creates cloud resources/);
      expect((error as FliskError).suggestions.join("\n")).toContain("flisk tool add postgresql");
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("reads a two-word tool typed without quotes as one tool", () => {
    quiet();
    expect(() => addTool("google", "cloud", {})).toThrow(/never creates cloud resources/);
    const run = vi.fn(() => undefined);
    addTool("llm", "apis", {}, run);
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["resource", "llm"]), false);
  });

  it("prints the steps for a tool Flisk cannot generate, and runs nothing", () => {
    const lines = quiet();
    const run = vi.fn();
    const result = addTool("Spring Boot", undefined, {}, run);
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "manual" });
    expect(lines.join("\n")).toContain("--type bring-your-own");
  });

  it("says Docker is built in", () => {
    const lines = quiet();
    expect(addTool("docker", undefined, {})).toMatchObject({ status: "built-in" });
    expect(lines.join("\n")).toContain("already runs container stacks");
  });

  it("names the known tools for an unknown one", () => {
    expect(() => addTool("cobol", undefined, {})).toThrow(/does not know the tool "cobol"/);
  });
});

describe("runResource", () => {
  const spawnResult = (status: number, stdout: string) =>
    vi.fn(() => ({ status, stdout, stderr: "", pid: 1, output: [], signal: null })) as never;

  it("returns the data of the child's JSON envelope", () => {
    const spawn = spawnResult(0, '{"data":{"name":"web"},"errors":[]}\n');
    expect(runResource(["resource", "web"], true, ["flisk"], spawn)).toEqual({ name: "web" });
  });

  it("throws the child's error message when it fails", () => {
    const spawn = spawnResult(1, '{"data":null,"errors":[{"message":"Not in a Flisk project"}]}');
    expect(() => runResource(["resource", "web"], true, ["flisk"], spawn)).toThrow(
      "Not in a Flisk project",
    );
  });

  it("throws when the child fails in text mode", () => {
    const spawn = spawnResult(1, "");
    expect(() => runResource(["resource", "web"], false, ["flisk"], spawn)).toThrow(/failed/);
  });
});
