// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Minimal API for the unopinionated fixture: no framework, no generated files, no container.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4000);

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url === "/hello") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "hello from the api" }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(port, () => console.log(`api listening on port ${port}`));
