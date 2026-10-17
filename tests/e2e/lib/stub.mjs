// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Stub agent for the error-path cases of agent-e2e.sh. Binds 127.0.0.1:<port>, standing in for the Traefik route that `tdk agent sessions` calls (the CLI is pointed here with TDK_SERVICE_BASE_URL).
//   node stub.mjs hang <port>               accept the connection, never answer
//   node stub.mjs stall <port>              send 200 headers, then never finish the body
//   node stub.mjs status <port> <code> <msg>  answer <code> with {"error": "<msg>"}
//   node stub.mjs json <port> <body>        answer 200 with <body> verbatim
import http from "node:http";

const [mode, portText, codeText, ...rest] = process.argv.slice(2);
const port = Number(portText);
if (!mode || !Number.isInteger(port)) {
  console.error("usage: stub.mjs hang|stall|status|json <port> [code message]");
  process.exit(2);
}

const server = http.createServer((req, res) => {
  if (mode === "hang") {
    req.resume();
    return; // never respond
  }
  if (mode === "stall") {
    res.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
    res.write('{"partial":'); // headers and a few bytes, then the body stalls
    return;
  }
  if (mode === "json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end([codeText, ...rest].join(" "));
    return;
  }
  if (mode === "status") {
    res.writeHead(Number(codeText), { "content-type": "application/json" });
    res.end(JSON.stringify({ error: rest.join(" ") }));
    return;
  }
  res.writeHead(500).end();
});
server.listen(port, "127.0.0.1", () => console.log(`stub ${mode} listening on ${port}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => process.exit(0));
