// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Security agent 2 of 3, triage: gives each finding a severity and a fix hint, then passes it to the reporter.
import { createServer } from "node:http";

const reporter = process.env.REPORTER_URL ?? "http://localhost:4202";
const knowledge = {
  "hardcoded-secret": {
    severity: "critical",
    fix: "Move the value to an environment variable and rotate it.",
  },
  "sql-concat": { severity: "high", fix: "Use a parameterized query." },
  eval: { severity: "high", fix: "Parse the input instead of evaluating it." },
  "plain-http": { severity: "medium", fix: "Use https." },
};

export function triage(finding) {
  return {
    ...finding,
    ...(knowledge[finding.rule] ?? { severity: "low", fix: "Review by hand." }),
  };
}

createServer(async (request, response) => {
  if (request.url === "/health") return response.end("ok");
  if (request.url === "/findings" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      body = null;
    }
    const findings = Array.isArray(body?.findings) ? body.findings.map(triage) : [];
    await fetch(`${reporter}/findings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findings }),
    }).catch(() => {});
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ triaged: findings.length }));
  }
  response.writeHead(404);
  response.end();
}).listen(Number(process.env.PORT ?? 4201));
