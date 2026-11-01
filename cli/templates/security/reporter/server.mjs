// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Security agent 3 of 3, the reporter: keeps the triaged findings and serves the report, worst first.
import { createServer } from "node:http";

const order = { critical: 0, high: 1, medium: 2, low: 3 };
const findings = [];

createServer(async (request, response) => {
  if (request.url === "/health") return response.end("ok");
  if (request.url === "/findings" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      if (Array.isArray(body.findings)) findings.push(...body.findings);
    } catch {
      // ignore a malformed body
    }
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ total: findings.length }));
  }
  if (request.url === "/report") {
    const sorted = [...findings].sort(
      (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
    );
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ total: sorted.length, findings: sorted }, null, 2));
  }
  response.writeHead(404);
  response.end();
}).listen(Number(process.env.PORT ?? 4202));
