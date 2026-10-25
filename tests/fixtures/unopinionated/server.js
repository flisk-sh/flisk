// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Minimal service for the unopinionated fixture: no framework, no generated files.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(port);
