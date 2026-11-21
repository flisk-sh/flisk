// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The website of the Flisk demo without Docker. It serves index.html and forwards /api/* to the menu API at API_URL.
import { readFileSync } from "node:fs";
import { createServer, request as forward } from "node:http";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf-8");
const api = new URL(process.env.API_URL ?? "http://localhost:4000");

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  // Only forward same-origin /api/ paths: parse against a fixed base, so "//evil.com" cannot change the host, and
  // reject traversal even when percent-encoded.
  const parsed = new URL(request.url ?? "/", "http://web.invalid");
  let apiPath = null;
  try {
    if (
      parsed.host === "web.invalid" &&
      parsed.pathname.startsWith("/api/") &&
      !decodeURIComponent(parsed.pathname).includes("..")
    ) {
      apiPath = parsed.pathname + parsed.search;
    }
  } catch {
    apiPath = null; // malformed percent-encoding
  }
  if (apiPath) {
    const upstream = forward(
      { host: api.hostname, port: api.port, path: apiPath, method: request.method },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "the menu API is not answering" }));
    });
    request.pipe(upstream);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page);
});

server.listen(Number(process.env.PORT), () => {
  console.log(`website listening on http://localhost:${process.env.PORT}`);
});
