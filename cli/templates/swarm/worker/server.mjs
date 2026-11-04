// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// A swarm worker: pulls a subtask from the coordinator, does it, posts the answer. Three manifests run this file.
// Replace `work` with a call to your model or tool; the swarm around it stays the same.
import { createServer } from "node:http";

const name = process.env.WORKER_NAME ?? "worker";
const coordinator = process.env.COORDINATOR_URL ?? "http://localhost:4100";

async function work(text) {
  // FAIL_RATE (0 to 1) makes this worker fail on purpose, to watch the swarm retry.
  if (Math.random() < Number(process.env.FAIL_RATE ?? 0))
    throw new Error(`${name} failed on purpose`);
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
  return `${name} handled "${text}" (${text.split(/\s+/).length} words)`;
}

async function post(path, body) {
  const response = await fetch(`${coordinator}${path}`, {
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
        try {
          await post("/complete", {
            id: task.id,
            attempt: task.attempt,
            result: await work(task.text),
          });
        } catch (error) {
          // Tell the coordinator, so it retries the subtask now instead of waiting for the claim to expire.
          await post("/fail", {
            id: task.id,
            attempt: task.attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }
    } catch {
      // the coordinator is not up yet; try again
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end(request.url === "/health" ? "ok" : name);
}).listen(Number(process.env.PORT));

loop();
