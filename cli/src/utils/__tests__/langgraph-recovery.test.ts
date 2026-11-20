// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// What the LangGraph starter does with a run it finds left in the middle (cli/templates/langgraph/agent/recovery.mjs). The file
// uses only Node, so it is tested here without installing LangGraph.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface Recovery {
  recoveryPlan(
    run: { decision?: { approved: boolean; note: string | null } | null },
    state: { values?: { goal?: string }; next?: string[]; tasks?: { interrupts?: unknown[] }[] },
  ): "start" | "done" | "resume-with-decision" | "continue";
}
const file = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates/langgraph/agent/recovery.mjs",
);
const load = (): Promise<Recovery> => import(pathToFileURL(file).href);

const decision = { approved: true, note: null };
const waiting = {
  values: { goal: "g" },
  next: ["approve"],
  tasks: [{ interrupts: [{ value: "?" }] }],
};

describe("recoveryPlan", () => {
  it("starts a run that died before its first checkpoint", async () => {
    const { recoveryPlan } = await load();
    expect(recoveryPlan({}, { values: {}, next: [] })).toBe("start");
  });

  it("only marks a run whose graph had reached its end as done", async () => {
    const { recoveryPlan } = await load();
    expect(recoveryPlan({}, { values: { goal: "g" }, next: [] })).toBe("done");
  });

  it("gives the saved answer to LangGraph again when the agent died after accepting it and before the checkpoint", async () => {
    const { recoveryPlan } = await load();
    expect(recoveryPlan({ decision }, waiting)).toBe("resume-with-decision");
  });

  it("picks the run up from its checkpoint when the checkpoint already holds the answer", async () => {
    const { recoveryPlan } = await load();
    const moved = { values: { goal: "g" }, next: ["act"], tasks: [{ interrupts: [] }] };
    expect(recoveryPlan({ decision }, moved)).toBe("continue");
  });

  it("continues, and does not invent an answer, when a waiting run has none saved", async () => {
    const { recoveryPlan } = await load();
    expect(recoveryPlan({}, waiting)).toBe("continue");
    expect(recoveryPlan({ decision: null }, waiting)).toBe("continue");
  });
});
