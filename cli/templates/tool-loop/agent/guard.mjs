// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Prompt-injection guard for the agent loop. No SDK in here, so it is tested offline.
//
// An agent is exposed when it holds all three legs of the "lethal trifecta": private data, untrusted content and a way to
// send things out or change things. This guard cuts the third leg after the second one shows up: once any tool has returned
// text (a web page, a file, a database row that someone else could have written), a destructive tool no longer runs
// without a human saying so. See docs/agents/ai-agents.md#the-lethal-trifecta.

/** Tools that change or send something. Edit the pattern, or list names in DESTRUCTIVE_TOOLS, for your own tools. */
export const DESTRUCTIVE_PATTERN =
  /(delete|drop|remove|destroy|truncate|send|post|push|exec|shell|write)/i;
export const DESTRUCTIVE_TOOLS = [];

export function isDestructive(name) {
  return DESTRUCTIVE_TOOLS.includes(name) || DESTRUCTIVE_PATTERN.test(name);
}

/**
 * Runs before the model sees a question. Fill it in: check the question, the caller, a rate limit. Return
 * { allow: false, reason } to refuse the request. The default allows everything.
 */
export async function beforeTurn(_context) {
  return { allow: true };
}

/**
 * One turn's state: `tainted` flips to true once a tool has returned text, and `blocked` lists the destructive calls that
 * were refused. Wrap every tool's `run` with `guardRun`.
 */
export function createTurnGuard({ allowDestructive = false } = {}) {
  const state = { tainted: false, blocked: [] };
  return {
    state,
    guardRun(name, run) {
      return async (args) => {
        if (isDestructive(name) && state.tainted && !allowDestructive) {
          state.blocked.push(name);
          return `Blocked: ${name} changes or sends something, and this turn already read content from a tool that someone else could have written. Ask the user to confirm it.`;
        }
        const result = await run(args);
        if (typeof result === "string" && result.length > 0) state.tainted = true;
        return result;
      };
    },
  };
}
