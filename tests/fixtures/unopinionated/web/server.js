// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Minimal website for the unopinionated fixture: it renders what the API returns, so a page that loads proves both run.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url === "/") {
    try {
      const { message } = await (await fetch(`${apiUrl}/hello`)).json();
      // Plain text, not HTML: the API text is never parsed as markup, so it cannot inject script.
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Website\n${message}\n`);
    } catch (error) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`API unreachable at ${apiUrl}: ${error.message}`);
    }
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(port, () => console.log(`website listening on port ${port}`));
