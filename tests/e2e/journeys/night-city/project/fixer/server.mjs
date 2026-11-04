// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// A fixer: claims one job from Netwatch, does it, posts the result. Three manifests run this file (fixer-1, fixer-2, fixer-3).
// It is the swarm worker with a fixed work time (WORK_MS), so a test knows how long a claim is held.
import { createServer } from "node:http";

const name = process.env.WORKER_NAME ?? "fixer";
const netwatch = process.env.NETWATCH_URL ?? "http://localhost:4600";
const workMs = Number(process.env.WORK_MS ?? 2000);

async function post(path, body) {
  const response = await fetch(`${netwatch}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

let lastError = "";
async function loop() {
  for (;;) {
    try {
      const claimed = await post("/claim", { worker: name });
      if (claimed.status !== 200) throw new Error(`POST /claim answered HTTP ${claimed.status}`);
      const { task } = claimed.body;
      lastError = "";
      if (task) {
        await new Promise((resolve) => setTimeout(resolve, workMs));
        const done = await post("/complete", {
          id: task.id,
          attempt: task.attempt,
          worker: name,
          result: `${name} finished ${task.kind} job "${task.text}"`,
        });
        if (done.status === 409) {
          // The claim expired and another attempt owns the job now: this work does not count.
          console.log(`${name}: job ${task.id} attempt ${task.attempt} was no longer mine (stale claim)`);
        } else if (done.status !== 200) {
          console.error(`${name}: completing job ${task.id} attempt ${task.attempt} answered HTTP ${done.status}: ${JSON.stringify(done.body)}`);
        }
        continue;
      }
    } catch (error) {
      // Netwatch may not be up yet or may be restarting: try again, but say why once.
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastError) console.error(`${name}: ${message}`);
      lastError = message;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end(request.url === "/health" ? "ok" : name);
}).listen(Number(process.env.PORT));

loop();
