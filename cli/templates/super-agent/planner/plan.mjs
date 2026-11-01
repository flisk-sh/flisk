// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How a goal becomes topics to research. Without ANTHROPIC_API_KEY the rules below plan; with it, Claude does.

/** Rules: a goal splits on ".", ";" and " and " into topics, so "a and b; c" gives three. */
export function planWithRules(goal) {
  return goal
    .split(/\.|;|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: { type: "string" },
      description: "One to six short topics to research, each answerable on its own",
    },
  },
  required: ["topics"],
  additionalProperties: false,
};

/**
 * Asks Claude for the topics. `client` is an Anthropic SDK client; any error, refusal or empty plan throws, and the caller
 * falls back to the rules.
 */
export async function planWithModel(goal, client) {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // A declined request is re-run on Anthropic's recommended fallback model instead of coming back as a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_SCHEMA } },
    system:
      "You plan research for a team of agents. Split the user's goal into one to six short topics a researcher can look up on its own.",
    messages: [{ role: "user", content: goal }],
  });
  if (response.stop_reason === "refusal") throw new Error("the model declined to plan this goal");
  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const topics =
    JSON.parse(text)
      .topics?.map((topic) => String(topic).trim())
      .filter(Boolean) ?? [];
  if (topics.length === 0) throw new Error("the model returned no topics");
  return topics.slice(0, 6);
}

let client;
/** The SDK client when ANTHROPIC_API_KEY is set and `@anthropic-ai/sdk` is installed in planner/, else null. */
export async function modelClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (client) return client;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
    return client;
  } catch {
    console.error(
      "ANTHROPIC_API_KEY is set but @anthropic-ai/sdk is not installed: run `npm install` in the folder of plan.mjs",
    );
    return null;
  }
}

/** The topics for a goal, and which planner made them. */
export async function plan(goal) {
  const model = await modelClient();
  if (model) {
    try {
      return { topics: await planWithModel(goal, model), planner: "model" };
    } catch (error) {
      console.error(`model planning failed, using the rules: ${error.message}`);
    }
  }
  return { topics: planWithRules(goal), planner: "rules" };
}
