import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

appendFileSync("../events.log", `${Math.floor(Date.now() / 1000)} boot web pid=${process.pid}\n`);
const API = process.env.API_URL;
const TOKEN = process.env.API_TOKEN ?? "";
if (!API) {
  console.error("FATAL: API_URL is not set");
  process.exit(1);
}
const page = readFileSync(new URL("./index.html", import.meta.url));
createServer(async (req, res) => {
  if (req.url === "/health") return res.end("ok");
  if (req.url?.startsWith("/api/")) {
    let body = "";
    for await (const c of req) body += c;
    try {
      const r = await fetch(API + req.url.slice(4), {
        method: req.method,
        headers: { "x-api-token": TOKEN, "content-type": "application/json" },
        body: req.method === "GET" ? undefined : body,
      });
      res.writeHead(r.status, { "content-type": "application/json" });
      return res.end(await r.text());
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: `api unreachable: ${e.message}` }));
    }
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(page);
}).listen(Number(process.env.PORT), "127.0.0.1", () => console.log(`web on ${process.env.PORT}`));
