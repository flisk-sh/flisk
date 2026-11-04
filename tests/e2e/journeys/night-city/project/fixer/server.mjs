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
  return response.json();
}

async function loop() {
  for (;;) {
    try {
      const { task } = await post("/claim", { worker: name });
      if (task) {
        await new Promise((resolve) => setTimeout(resolve, workMs));
        await post("/complete", {
          id: task.id,
          attempt: task.attempt,
          worker: name,
          result: `${name} finished ${task.kind} job "${task.text}"`,
        });
        continue;
      }
    } catch {
      // Netwatch is not up yet or restarting; try again.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end(request.url === "/health" ? "ok" : name);
}).listen(Number(process.env.PORT));

loop();
