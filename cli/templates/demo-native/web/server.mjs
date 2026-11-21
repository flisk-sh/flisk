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
  // Same-origin /api/ only: "//evil.com" cannot change the host, and ".." or "%2e" never pass. A target that
  // does not parse (such as "//") gets the page.
  let apiPath = null;
  try {
    const parsed = new URL(request.url ?? "/", "https://web.invalid");
    if (parsed.host === "web.invalid" && /^\/api\/(?!.*(\.\.|%2e))/i.test(parsed.pathname)) {
      apiPath = parsed.pathname + parsed.search;
    }
  } catch {}
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
