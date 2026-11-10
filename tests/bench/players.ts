// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// A player gets a broken project and the developer's prompt, and may change anything in the project directory.
import { spawnSync } from "node:child_process";
import { flisk } from "./flisk.js";

export interface PlayResult {
  /** Tokens the player read and wrote (cache reads included); 0 for players that use no model. */
  tokens: number;
  costUsd: number;
  turns: number;
  note: string;
}

export interface Player {
  id: string;
  label: string;
  play(dir: string, prompt: string, path: string): PlayResult;
}

const NONE: PlayResult = { tokens: 0, costUsd: 0, turns: 0, note: "" };

/** Changes nothing: proves every task really is broken. */
const nothing: Player = { id: "nothing", label: "Do nothing (control)", play: () => NONE };

/** Flisk's own repair command, no model. */
const doctorFix: Player = {
  id: "doctor-fix",
  label: "flisk doctor --fix",
  play(dir) {
    const result = flisk(dir, ["doctor", "--fix", "--yes"]);
    return { ...NONE, note: `exit ${result.status}` };
  },
};

/** Claude Code in print mode with the developer's prompt; a nested session must not inherit this one's env. */
function claude(model: string, label: string): Player {
  return {
    id: `claude-${model}`,
    label,
    play(dir, prompt, path) {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined || key.startsWith("CLAUDE_CODE_") || key === "CLAUDECODE") continue;
        env[key] = value;
      }
      env.PATH = `${path}:${env.PATH ?? ""}`;
      const result = spawnSync(
        "claude",
        [
          "-p",
          `${prompt}\nThe \`flisk\` command is on PATH. Do not ask questions; make the fix.`,
          "--model",
          model,
          "--output-format",
          "json",
          "--dangerously-skip-permissions",
          "--max-turns",
          "40",
        ],
        { cwd: dir, env, encoding: "utf-8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 },
      );
      try {
        const out = JSON.parse(result.stdout);
        const usage = out.usage ?? {};
        const tokens =
          (usage.input_tokens ?? 0) +
          (usage.output_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
        return {
          tokens,
          costUsd: out.total_cost_usd ?? 0,
          turns: out.num_turns ?? 0,
          note: out.is_error ? `error: ${out.subtype}` : "",
        };
      } catch {
        return { ...NONE, note: `no JSON (exit ${result.status}): ${result.stderr.slice(0, 200)}` };
      }
    },
  };
}

export const PLAYERS: Player[] = [
  nothing,
  doctorFix,
  claude("haiku", "Claude Haiku"),
  claude("sonnet", "Claude Sonnet"),
];
