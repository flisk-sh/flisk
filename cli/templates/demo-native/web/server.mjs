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
  if (request.url?.startsWith("/api/")) {
    const upstream = forward(
      { host: api.hostname, port: api.port, path: request.url, method: request.method },
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
