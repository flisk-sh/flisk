import { execFile } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

appendFileSync("../events.log", `${Math.floor(Date.now() / 1000)} boot api pid=${process.pid}\n`);
const need = ["PORT", "API_TOKEN", "DATABASE_URL"].filter((k) => !process.env[k]);
if (need.length) {
  console.error(`FATAL: required environment variable(s) not set: ${need.join(", ")}`);
  process.exit(1);
}
const limits = JSON.parse(readFileSync(new URL("./config/limits.json", import.meta.url), "utf8"));
const noteLimit = Number(process.env.NOTES_LIMIT ?? "100");

const sql = (query) =>
  new Promise((ok, fail) =>
    execFile(
      "psql",
      [process.env.DATABASE_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
      (e, out, err) => (e ? fail(new Error(err.trim() || e.message)) : ok(out.trim())),
    ),
  );
const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    if (req.url === "/health") {
      await sql("select 1");
      return send(res, 200, { ok: true });
    }
    if (req.headers["x-api-token"] !== process.env.API_TOKEN) return send(res, 401, { error: "bad token" });
    if (req.url === "/notes" && req.method === "GET") {
      const rows = await sql("select coalesce(json_agg(n order by id),'[]') from notes n");
      return send(res, 200, JSON.parse(rows || "[]"));
    }
    if (req.url === "/notes" && req.method === "POST") {
      let raw = "";
      for await (const c of req) raw += c;
      const text = String(JSON.parse(raw).text ?? "").slice(0, limits.maxTextLength).replaceAll("'", "''");
      const count = Number(await sql("select count(*) from notes"));
      if (count >= noteLimit) return send(res, 409, { error: `note limit reached (NOTES_LIMIT=${noteLimit})` });
      const row = await sql(`insert into notes(text) values ('${text}') returning json_build_object('id',id,'text',text)`);
      return send(res, 201, JSON.parse(row.split("\n")[0]));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(`request failed: ${e.message}`);
    send(res, 503, { error: e.message });
  }
}).listen(Number(process.env.PORT), "127.0.0.1", () => console.log(`api on ${process.env.PORT}`));
