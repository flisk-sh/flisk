// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { DEFAULT_BACKEND_LANGUAGE } from "../../backend-languages/registry.js";
import { backendCatalog, extraCatalog, frontendCatalog } from "../create-catalog.js";
import {
  buildCreatePlan,
  CREATE_STACK,
  type CreateAnswers,
  describeAnswers,
  describeParts,
  describeRequirements,
  isEmptyApp,
  isValidProjectName,
} from "../create-plan.js";

// Ids come from the registries, so these tests keep working when a generator is added or renamed.
const firstFrontend = frontendCatalog()[0]?.id ?? "";
const defaultBackend = backendCatalog()[0];
const framework = defaultBackend?.frameworks[0]?.id ?? "";
const otherLanguage = backendCatalog()[1]?.id ?? "";

function answers(patch: Partial<CreateAnswers> = {}): CreateAnswers {
  return {
    name: "shop",
    runtime: "local",
    frontend: firstFrontend,
    backend: { language: DEFAULT_BACKEND_LANGUAGE, framework },
    extras: [],
    ...patch,
  };
}

const argsOf = (patch: Partial<CreateAnswers> = {}) =>
  buildCreatePlan(answers(patch)).map((step) => step.args);

describe("a local app is built by the real flisk commands", () => {
  it("is flisk project, then the API, then the website, each with --local and its own folder", () => {
    expect(argsOf()).toEqual([
      ["project", "--yes"],
      [
        "resource",
        "shop-api",
        "--type",
        "backend",
        "--framework",
        framework,
        "--path",
        "api",
        "--local",
        "--stack",
        CREATE_STACK,
        "--yes",
      ],
      [
        "resource",
        "shop-web",
        "--type",
        "frontend",
        "--framework",
        firstFrontend,
        "--path",
        "web",
        "--local",
        "--stack",
        CREATE_STACK,
        "--yes",
      ],
    ]);
  });

  it("creates the API before the website, so the website is wired to it", () => {
    const names = argsOf().map((args) => args[1]);
    expect(names.indexOf("shop-api")).toBeLessThan(names.indexOf("shop-web"));
  });

  it("every step runs inside the project and asks no question", () => {
    for (const step of buildCreatePlan(answers())) {
      expect(step.inProject).toBe(true);
      if (step.args[0] === "resource" || step.args[0] === "project")
        expect(step.args).toContain("--yes");
    }
  });

  it("a website alone, or an API alone, builds just that part", () => {
    const web = argsOf({ backend: undefined }).flat();
    expect(web).toContain("frontend");
    expect(web).not.toContain("backend");
    const api = argsOf({ frontend: undefined }).flat();
    expect(api).toContain("backend");
    expect(api).not.toContain("frontend");
  });

  it("the default language passes its framework; another language passes --language and no framework", () => {
    const apiStep = (patch: Partial<CreateAnswers>) =>
      argsOf(patch).find((args) => args[1] === "shop-api") ?? [];
    expect(apiStep({})).not.toContain("--language");
    expect(apiStep({})).toContain(framework);
    const other = apiStep({ backend: { language: otherLanguage } });
    expect(other).toContain("--language");
    expect(other).toContain(otherLanguage);
    expect(other).not.toContain("--framework");
  });

  it("adds no infrastructure, whatever extras were passed", () => {
    const names = argsOf({ extras: extraCatalog().map((extra) => extra.id) }).map(
      (args) => args[1],
    );
    expect(names).toEqual(["--yes", "shop-api", "shop-web"]);
  });
});

describe("the Docker route is the same commands without --local", () => {
  it("has no --local and no --path, and keeps the stack", () => {
    const flat = argsOf({ runtime: "docker" }).flat();
    expect(flat).not.toContain("--local");
    expect(flat).not.toContain("--path");
    expect(flat).toContain(CREATE_STACK);
  });

  it("adds one resource per extra, named after it, with its type and framework", () => {
    const extras = extraCatalog();
    const plan = argsOf({ runtime: "docker", extras: extras.map((e) => e.id) });
    for (const extra of extras) {
      const step = plan.find((args) => args[1] === `shop-${extra.id.replace(":", "-")}`);
      expect(step, extra.id).toBeDefined();
      expect(step?.[step.indexOf("--type") + 1]).toBe(extra.type);
      if (extra.framework) expect(step?.[step.indexOf("--framework") + 1]).toBe(extra.framework);
    }
  });

  it("skips an extra that is not in the catalog instead of guessing a command", () => {
    const plan = argsOf({ runtime: "docker", extras: ["not-a-real-extra"] });
    expect(plan).toHaveLength(3);
  });
});

describe("a starter is one flisk project command", () => {
  it("clones into the named folder, outside the project", () => {
    const steps = buildCreatePlan(answers({ starter: "anything", runtime: "docker" }));
    expect(steps).toHaveLength(1);
    expect(steps[0]?.args).toEqual(["project", "anything", "--path", "shop", "--yes"]);
    expect(steps[0]?.inProject).toBe(false);
  });
});

describe("the review sentences", () => {
  it("a local project lists the programs it needs and what is missing here", () => {
    const text = describeRequirements(answers(), (program) => program !== "npm");
    expect(text).toContain("No Docker, no Tilt, no database");
    expect(text).toContain("Not found on this machine: npm");
    expect(describeRequirements(answers(), () => true)).not.toContain("Not found");
  });

  it("a Docker project names Docker and Tilt; a starter points at its own README", () => {
    expect(describeRequirements(answers({ runtime: "docker" }))).toMatch(/Docker and Tilt/);
    expect(describeRequirements(answers({ starter: "x" }))).toMatch(/README/);
  });

  it("lists the parts the plan creates, and only what was chosen", () => {
    const local = answers();
    expect(describeParts(local, buildCreatePlan(local))).toBe("shop-api, shop-web");
    expect(describeParts(answers({ starter: "x" }), [])).toBe('the "x" starter');
    expect(describeAnswers(answers({ backend: undefined })).join("\n")).toContain("api: none");
    expect(describeAnswers(answers({ starter: "x" }))).toEqual(["name: shop", "starter: x"]);
    expect(describeAnswers(answers({ runtime: "docker" })).join("\n")).toContain("extras: none");
  });

  it("knows an app with nothing in it is empty", () => {
    expect(isEmptyApp(answers({ frontend: undefined, backend: undefined }))).toBe(true);
    expect(isEmptyApp(answers())).toBe(false);
    expect(isEmptyApp(answers({ frontend: undefined, backend: undefined, starter: "x" }))).toBe(
      false,
    );
  });
});

describe("isValidProjectName", () => {
  it.each(["app", "my-app", "shop2", "a-b-c"])("accepts %s", (name) => {
    expect(isValidProjectName(name)).toBe(true);
  });
  it.each(["", "My_App", "-app", "app-", "a--b", "2app", "has space", "x".repeat(49), "../evil"])(
    "rejects %j",
    (name) => {
      expect(isValidProjectName(name)).toBe(false);
    },
  );
});

describe("database:postgres on the Docker route", () => {
  const docker = (patch: Partial<CreateAnswers> = {}) => argsOf({ runtime: "docker", ...patch });

  it("adds the Postgres resource step", () => {
    expect(docker({ extras: ["database:postgres"] })).toContainEqual([
      "resource",
      "shop-database-postgres",
      "--type",
      "database",
      "--framework",
      "postgres",
      "--stack",
      CREATE_STACK,
      "--yes",
    ]);
  });

  it("passes --feature prisma on the API so the migrator exists, and only with postgres", () => {
    const api = (extras: string[]) =>
      docker({ extras }).find((args) => args[1] === "shop-api") ?? [];
    expect(api(["database:postgres"])).toEqual(expect.arrayContaining(["--feature", "prisma"]));
    expect(api([])).not.toContain("--feature");
    expect(api(["queue:nats"])).not.toContain("--feature");
  });

  it("does not ask for the migrator when there is no API", () => {
    expect(docker({ backend: undefined, extras: ["database:postgres"] }).flat()).not.toContain(
      "prisma",
    );
  });
});
