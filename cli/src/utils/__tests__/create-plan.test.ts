// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  asksBackend,
  asksExtras,
  asksFrontend,
  buildCreatePlan,
  CREATE_DEFAULTS,
  CREATE_KINDS,
  CREATE_STACK,
  type CreateAnswers,
  describeAnswers,
  isTemplateKind,
  isValidProjectName,
  parseExtras,
} from "../create-plan.js";

function answers(patch: Partial<CreateAnswers> = {}): CreateAnswers {
  return { name: "shop", ...CREATE_DEFAULTS, ...patch };
}

const argsOf = (patch: Partial<CreateAnswers>) =>
  buildCreatePlan(answers(patch)).map((s) => s.args);

describe("buildCreatePlan", () => {
  it("builds a website and an API from the defaults", () => {
    expect(argsOf({})).toEqual([
      ["project", "--yes"],
      [
        "resource",
        "shop-api",
        "--type",
        "backend",
        "--framework",
        "hono",
        "--stack",
        "app",
        "--yes",
      ],
      [
        "resource",
        "shop-web",
        "--type",
        "frontend",
        "--framework",
        "react",
        "--stack",
        "app",
        "--yes",
      ],
    ]);
  });

  it("leaves out the website when the person picks none", () => {
    const steps = argsOf({ frontend: "none" });
    expect(steps).toHaveLength(2);
    expect(steps.flat()).not.toContain("frontend");
  });

  it("an API kind never adds a website, whatever the frontend answer says", () => {
    const steps = argsOf({ kind: "api", frontend: "vue" });
    expect(steps.flat()).not.toContain("frontend");
    expect(steps.flat()).not.toContain("vue");
  });

  it("adds one resource per extra, with the right type and framework", () => {
    const steps = argsOf({ extras: ["queue", "redis", "worker", "mcp", "agent"] });
    const stepFor = (name: string) => steps.find((s) => s[1] === name);
    expect(stepFor("shop-queue")).toContain("nats");
    expect(stepFor("shop-queue")?.[3]).toBe("queue");
    expect(stepFor("shop-redis")?.slice(3, 6)).toEqual(["database", "--framework", "redis"]);
    expect(stepFor("shop-worker")?.[3]).toBe("worker");
    expect(stepFor("shop-tools")?.[3]).toBe("mcp");
    expect(stepFor("shop-agent")?.[3]).toBe("agent");
  });

  it("puts every generated resource in the same stack and never asks a question", () => {
    for (const step of argsOf({ extras: ["queue", "worker"] })) {
      if (step[0] !== "resource") continue;
      expect(step[step.indexOf("--stack") + 1]).toBe(CREATE_STACK);
      expect(step).toContain("--yes");
    }
  });

  it("a template kind is one project command into the named folder", () => {
    expect(argsOf({ kind: "saas" })).toEqual([["project", "saas", "--path", "shop", "--yes"]]);
    expect(argsOf({ kind: "agent" })).toEqual([
      ["project", "agent-stack", "--path", "shop", "--yes"],
    ]);
    expect(argsOf({ kind: "swarm" })).toEqual([["project", "swarm", "--path", "shop", "--yes"]]);
    expect(argsOf({ kind: "ecommerce" })).toEqual([
      ["project", "ecommerce", "--path", "shop", "--yes"],
    ]);
  });

  it("runs a template in the current folder and generated resources inside the project", () => {
    expect(buildCreatePlan(answers({ kind: "saas" })).every((s) => !s.inProject)).toBe(true);
    expect(buildCreatePlan(answers({ kind: "web" })).every((s) => s.inProject)).toBe(true);
  });

  it("every kind produces a non-empty plan", () => {
    for (const kind of CREATE_KINDS) expect(buildCreatePlan(answers({ kind }))).not.toHaveLength(0);
  });
});

describe("which questions a kind asks", () => {
  it("asks the website question only for a web app", () => {
    expect(CREATE_KINDS.filter(asksFrontend)).toEqual(["web"]);
  });
  it("asks the API and extras questions for a web app and an API", () => {
    expect(CREATE_KINDS.filter(asksBackend)).toEqual(["web", "api"]);
    expect(CREATE_KINDS.filter(asksExtras)).toEqual(["web", "api"]);
  });
  it("treats the four starters as templates", () => {
    expect(CREATE_KINDS.filter(isTemplateKind)).toEqual(["saas", "agent", "swarm", "ecommerce"]);
  });
  it("the summary lists only what the kind uses", () => {
    expect(describeAnswers(answers({ kind: "saas" }))).toEqual(["name: shop", "kind: saas"]);
    expect(describeAnswers(answers({ kind: "web", extras: ["queue"] }))).toContain("extras: queue");
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

describe("parseExtras", () => {
  it("parses a list, trims and drops repeats", () => {
    expect(parseExtras("queue, worker,queue")).toEqual({ extras: ["queue", "worker"] });
  });
  it("names the first unknown extra and the valid ones", () => {
    const result = parseExtras("queue,kafka");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain('"kafka"');
    expect((result as { error: string }).error).toContain("queue, worker, mcp, agent, redis");
  });
});
