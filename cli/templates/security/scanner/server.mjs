// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Security agent 1 of 3, the scanner: looks for risky patterns in the files it is sent and passes findings to triage.
import { createServer } from "node:http";

const triage = process.env.TRIAGE_URL ?? "http://localhost:4201";
const rules = [
  { id: "hardcoded-secret", pattern: /(api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{6,}["']/i },
  { id: "eval", pattern: /\beval\s*\(/ },
  { id: "sql-concat", pattern: /(select|insert|update|delete)\b[^;\n]*["']\s*\+/i },
  { id: "plain-http", pattern: /["']http:\/\/(?!localhost|127\.0\.0\.1)/i },
];

export function scan(files) {
  const findings = [];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, index) => {
      for (const rule of rules) {
        if (rule.pattern.test(line))
          findings.push({ rule: rule.id, file, line: index + 1, text: line.trim() });
      }
    });
  }
  return findings;
}

createServer(async (request, response) => {
  if (request.url === "/health") return response.end("ok");
  if (request.url === "/scan" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      body = null;
    }
    if (!body || typeof body.files !== "object" || body.files === null) {
      response.writeHead(400, { "content-type": "application/json" });
      return response.end(JSON.stringify({ error: 'send {"files":{"name":"code"}}' }));
    }
    const findings = scan(body.files);
    await fetch(`${triage}/findings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findings }),
    }).catch(() => {});
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ found: findings.length }));
  }
  response.writeHead(404);
  response.end();
}).listen(Number(process.env.PORT ?? 4200));
