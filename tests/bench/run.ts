// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Flisk-Bench runner: every player tries every task on its own copy of the broken project.
//   bun tests/bench/run.ts [--players nothing,doctor-fix] [--tasks typo-dependson] [--out results.json]
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { flisk, fliskShim } from "./flisk.js";
import { PLAYERS } from "./players.js";
import { editManifest, TASKS } from "./tasks.js";

const { values } = parseArgs({
  options: {
    players: { type: "string" },
    tasks: { type: "string" },
    out: { type: "string" },
  },
});
const pick = <T extends { id: string }>(all: T[], list?: string): T[] => {
  if (!list) return all;
  const ids = list.split(",");
  const unknown = ids.filter((id) => !all.some((item) => item.id === id));
  if (unknown.length) throw new Error(`unknown: ${unknown.join(", ")}`);
  return all.filter((item) => ids.includes(item.id));
};
const players = pick(PLAYERS, values.players);
const tasks = pick(TASKS, values.tasks);

function must(result: ReturnType<typeof flisk>, what: string): void {
  if (result.status !== 0) throw new Error(`${what} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
}

// One healthy project: stack shop, billing (4000), orders (4001) dependsOn billing.
const root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-bench-")));
const healthy = join(root, "healthy");
mkdirSync(healthy);
must(flisk(healthy, ["project", "--yes", "--no-agent-skills"]), "flisk project");
for (const name of ["billing", "orders"]) {
  must(flisk(healthy, ["resource", name, "--yes", "--type", "backend", "--stack", "shop"]), `resource ${name}`);
}
editManifest(healthy, "orders", (m) => (m.dependsOn = ["billing"]));
must(flisk(healthy, ["config", "regenerate"]), "config regenerate");
const path = fliskShim(root);

interface Row {
  task: string;
  player: string;
  pass: boolean;
  reason: string;
  seconds: number;
  tokens: number;
  costUsd: number;
  turns: number;
  note: string;
}
const rows: Row[] = [];

for (const task of tasks) {
  // The check must accept the healthy project and refuse the broken one, or the task proves nothing.
  const sane = task.check(healthy);
  if (!sane.pass) throw new Error(`${task.id}: healthy project fails the check: ${sane.reason}`);
  const broken = join(root, `${task.id}-broken`);
  cpSync(healthy, broken, { recursive: true });
  task.breakIt(broken);
  const refused = task.check(broken);
  if (refused.pass) throw new Error(`${task.id}: broken project passes the check`);

  for (const player of players) {
    const dir = join(root, `${task.id}-${player.id}`);
    cpSync(broken, dir, { recursive: true });
    const started = Date.now();
    const played = player.play(dir, task.prompt, path);
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    const verdict = task.check(dir);
    const row = { task: task.id, player: player.id, ...verdict, seconds, ...played };
    rows.push(row);
    console.error(
      `${verdict.pass ? "PASS" : "FAIL"}  ${task.id.padEnd(20)} ${player.id.padEnd(14)} ${String(seconds).padStart(6)}s  ${verdict.reason}`,
    );
  }
}

const table = [
  "| Player | Fixed | Tokens | Cost | Time |",
  "| --- | --- | --- | --- | --- |",
  ...players.map((player) => {
    const mine = rows.filter((row) => row.player === player.id);
    const sum = (key: "tokens" | "costUsd" | "seconds") => mine.reduce((total, row) => total + row[key], 0);
    return `| ${player.label} | ${mine.filter((row) => row.pass).length} / ${mine.length} | ${sum("tokens").toLocaleString("en-US")} | $${sum("costUsd").toFixed(2)} | ${Math.round(sum("seconds"))} s |`;
  }),
].join("\n");
console.log(table);

const report = { version: "v0", date: new Date().toISOString(), workDir: root, rows, table };
if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
