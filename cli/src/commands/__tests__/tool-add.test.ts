// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { FRONTEND_FRAMEWORKS } from "../../frontend-frameworks/registry.js";
import { DATABASE_FRAMEWORKS } from "../../types/index.js";
import { FliskError } from "../../utils/errors.js";
import {
  findTool,
  manualSteps,
  resourceArgs,
  TOOL_CATALOG,
  toolKey,
} from "../../utils/tool-catalog.js";
import { getRegisteredCommands } from "../registry.js";
import { addTool, checkResource, formatToolList, resolveWords, runResource } from "../tool.js";

type Run = (args: string[], json: boolean) => unknown;

/** addTool in a project with no resources yet, so the checks that read the project's resources see none. */
function add(words: string[], options: Parameters<typeof addTool>[1], run: Run = () => undefined) {
  return addTool(words, options, run, () => ({ resources: [] }));
}

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
    add([], {});
    expect(lines.join("\n")).toBe(formatToolList().join("\n"));
    for (const tool of TOOL_CATALOG) expect(lines.join("\n")).toContain(tool.id);
  });

  it("runs flisk resource for a tool Flisk generates", () => {
    quiet();
    const run = vi.fn(() => undefined);
    add(["FastAPI", "orders"], { stack: "shop" }, run);
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
    const result = add(["postgres"], { json: true }, run);
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
        add(input.split(" "), {}, run);
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
    expect(() => add(["google", "cloud"], {})).toThrow(/never creates cloud resources/);
    const run = vi.fn(() => undefined);
    add(["llm", "apis"], {}, run);
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["resource", "llm"]), false);
  });

  it("prints the steps for a tool Flisk cannot generate, and runs nothing", () => {
    const lines = quiet();
    const run = vi.fn();
    const result = add(["Spring", "Boot"], {}, run);
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "manual" });
    expect(lines.join("\n")).toContain("--type bring-your-own");
  });

  it("says Docker is built in", () => {
    const lines = quiet();
    expect(add(["docker"], {})).toMatchObject({ status: "built-in" });
    expect(lines.join("\n")).toContain("already runs container stacks");
  });

  it("names the known tools for an unknown one", () => {
    expect(() => add(["cobol"], {})).toThrow(/does not know the tool "cobol"/);
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

describe("flisk tool add: dogfood fixes", () => {
  const react = findTool("react");
  const nextjs = findTool("nextjs");
  if (react?.status !== "resource" || nextjs?.status !== "resource") {
    throw new Error("react and nextjs should add resources");
  }

  it("refuses a name that is taken instead of reporting a tool it never added", () => {
    const run = vi.fn();
    const project = () => ({ resources: [{ name: "web", stack: "main", type: "frontend" }] });
    let error: unknown;
    try {
      addTool(["nextjs"], {}, run, project);
    } catch (caught) {
      error = caught;
    }
    expect(run).not.toHaveBeenCalled();
    expect((error as FliskError).message).toBe(
      'A resource named "web" already exists (frontend), so Next.js was not added.',
    );
    expect((error as FliskError).suggestions[0]).toBe(
      "Add it under another name: flisk tool add nextjs nextjs-web",
    );
    // Under a free name it runs.
    addTool(["nextjs", "site"], {}, run, project);
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["resource", "site"]), false);
  });

  it("names the stacks and suggests flisk tool add --stack when there are several", () => {
    const project = {
      resources: [
        { name: "web", stack: "shop" },
        { name: "db", stack: "main" },
      ],
    };
    let error: unknown;
    try {
      checkResource(nextjs, "site", undefined, project);
    } catch (caught) {
      error = caught;
    }
    expect((error as FliskError).message).toBe(
      "This project has 2 stacks (main, shop); say which one gets Next.js.",
    );
    expect((error as FliskError).suggestions).toEqual([
      "flisk tool add nextjs site --stack main",
      "flisk tool add nextjs site --stack shop",
    ]);
    expect(() => checkResource(nextjs, "site", "shop", project)).not.toThrow();
  });

  it("rejects an invalid name once, before running flisk resource", () => {
    const run = vi.fn();
    expect(() => add(["react", "My Web"], {}, run)).toThrow(/Resource name "My Web" is not valid/);
    expect(run).not.toHaveBeenCalled();
  });

  it("reads tools of three words and a trailing name", () => {
    expect(resolveWords(["google", "cloud", "platform"]).tool.id).toBe("google-cloud");
    expect(resolveWords(["spring", "boot", "orders"])).toMatchObject({
      tool: { id: "spring-boot" },
      name: "orders",
    });
    expect(resolveWords(["react", "web"])).toMatchObject({ tool: { id: "react" }, name: "web" });
    expect(() => resolveWords(["react", "my", "web"])).toThrow(/more than one resource name/);
    expect(() => add(["google", "cloud", "platform"], {})).toThrow(/never creates cloud resources/);
  });

  it("names backends server by default, so the route is not /api/api", () => {
    for (const id of ["nodejs", "fastapi"]) {
      const tool = findTool(id);
      expect(tool?.status === "resource" && tool.defaultName).toBe("server");
    }
  });

  it("quotes arguments in the suggested command when flisk resource fails", () => {
    const spawn = vi.fn(() => ({
      status: 1,
      stdout: "",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    }));
    let error: unknown;
    try {
      runResource(["resource", "a b"], false, ["flisk"], spawn as never);
    } catch (caught) {
      error = caught;
    }
    expect((error as FliskError).suggestions[0]).toBe(
      "Run it yourself to see why: flisk resource 'a b'",
    );
  });
});

describe("flisk tool add: dogfood pass 2 fixes", () => {
  it("fails once outside a project, before running flisk resource, with the command that fixes it", () => {
    const run = vi.fn();
    let error: unknown;
    try {
      addTool(["react"], {}, run, () => undefined);
    } catch (caught) {
      error = caught;
    }
    expect(run).not.toHaveBeenCalled();
    expect((error as FliskError).message).toMatch(/Could not find project root/);
    expect((error as FliskError).suggestions).toEqual([
      "Run this from within a Flisk project",
      "Run `flisk project --yes` to initialize a new project",
      "Then run: flisk tool add react",
    ]);
  });

  it("still prints manual steps and built-in notes outside a project", () => {
    quiet();
    expect(addTool(["spring", "boot"], {}, vi.fn(), () => undefined)).toMatchObject({
      status: "manual",
    });
    expect(addTool(["docker"], {}, vi.fn(), () => undefined)).toMatchObject({ status: "built-in" });
  });

  it("puts the given name into a manual tool's steps, or the default", () => {
    const spring = findTool("spring-boot");
    if (spring?.status !== "manual") throw new Error("spring-boot should be manual");
    expect(manualSteps(spring, "orders").join("\n")).toContain("flisk resource orders --type");
    expect(manualSteps(spring, "orders").join("\n")).not.toContain("{name}");
    expect(manualSteps(spring).join("\n")).toContain("-d name=server");
    const lines = quiet();
    const result = add(["spring", "boot", "orders"], {});
    expect(lines.join("\n")).toContain("--path orders");
    expect((result as { steps: string[] }).steps.join("\n")).toContain(
      "unzip orders.zip -d orders",
    );
  });

  it("leaves no {name} placeholder in any manual tool, with or without a name", () => {
    for (const tool of TOOL_CATALOG) {
      if (tool.status !== "manual") continue;
      expect(manualSteps(tool, "x-1").join("\n"), tool.id).not.toContain("{name}");
      expect(manualSteps(tool).join("\n"), tool.id).not.toContain("{name}");
    }
  });

  it("says so when a tool that is not a service is given a name", () => {
    expect(() => add(["docker", "mydocker"], {})).toThrow(
      'Docker takes no resource name, so "mydocker" was not used.',
    );
    expect(() => add(["github", "actions", "ci"], {})).toThrow(/takes no resource name/);
    expect(() => add(["github", "actions"], {})).not.toThrow();
  });

  it("validates the name given to a manual tool", () => {
    expect(() => add(["angular", "My App"], {})).toThrow(/Resource name "My App" is not valid/);
  });
});
