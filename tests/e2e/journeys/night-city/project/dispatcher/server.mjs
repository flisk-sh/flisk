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
  const listed = await fetch(`${netwatch}/gigs?status=open`);
  if (!listed.ok) throw new Error(`GET /gigs?status=open answered HTTP ${listed.status}`);
  const { gigs } = await listed.json();
  for (const gig of gigs) {
    const jobs = plan(gig.title);
    if (jobs.length === 0) continue;
    const response = await fetch(`${netwatch}/gigs/${gig.id}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobs }),
    });
    // 201: dispatched. 409: another dispatcher (or this one before a restart) already did it. Anything else is a failure to show.
    if (response.status === 201) console.log(`dispatcher: gig ${gig.id} split into ${jobs.length} jobs`);
    else if (response.status !== 409) {
      throw new Error(`gig ${gig.id}: POST /gigs/${gig.id}/jobs answered HTTP ${response.status}: ${await response.text()}`);
    }
  }
}

createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end(request.url === "/health" ? "ok" : "dispatcher");
}).listen(Number(process.env.PORT));

let lastError = "";
for (;;) {
  try {
    await tick();
    lastError = "";
  } catch (error) {
    // Netwatch may not be up yet or may be restarting: try again, but say why once, so a real failure is in the log.
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastError) console.error(`dispatcher: ${message}`);
    lastError = message;
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}
