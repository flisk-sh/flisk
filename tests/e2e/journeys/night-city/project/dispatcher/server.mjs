// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The dispatcher: a rule-based agent (no model, no API key). It watches Netwatch for open gigs, splits each one into jobs and
// labels every job with a kind. The same input always gives the same jobs, so a test can assert them. Swap `plan()` for a model
// call to make it a real planner; the loop around it stays the same.
import { createServer } from "node:http";

const netwatch = process.env.NETWATCH_URL ?? "http://localhost:4600";

const RULES = [
  [/\b(scout|recon|scan|watch)\b/i, "recon"],
  [/\b(hack|breach|crack|jack)\b/i, "intrusion"],
  [/\b(extract|steal|download|copy)\b/i, "extraction"],
  [/\b(escape|exit|flee|vanish)\b/i, "exfil"],
];

/** Splits a gig's title into jobs: one per sentence, labelled by the first rule that matches. */
export function plan(title) {
  return title
    .split(/[.;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((text) => ({ text, kind: RULES.find(([pattern]) => pattern.test(text))?.[1] ?? "general" }));
}

async function tick() {
  const { gigs } = await (await fetch(`${netwatch}/gigs?status=open`)).json();
  for (const gig of gigs) {
    const jobs = plan(gig.title);
    if (jobs.length === 0) continue;
    // Netwatch accepts the jobs once: a second dispatcher (or this one after a restart) gets 409 and moves on.
    await fetch(`${netwatch}/gigs/${gig.id}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobs }),
    });
  }
}

createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end(request.url === "/health" ? "ok" : "dispatcher");
}).listen(Number(process.env.PORT));

for (;;) {
  try {
    await tick();
  } catch {
    // Netwatch is not up yet or restarting; try again.
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}
