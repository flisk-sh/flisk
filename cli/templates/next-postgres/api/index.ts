import express from "express";
import { rateLimit } from "express-rate-limit";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(express.json());

// Rate limit every route, so a runaway client cannot flood the database. Behind Traefik clients can share one IP, so the cap is generous.
app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

// The frontend runs on its own *.localhost origin (app.<project>.localhost), so the browser needs CORS to call this API.
const LOCAL_FRONTEND_ORIGIN = /^(https?):\/\/((?:[a-z0-9-]+\.)+localhost)(:\d+)?$/;
app.use((req, res, next) => {
  const match = LOCAL_FRONTEND_ORIGIN.exec(req.headers.origin ?? "");
  if (match) {
    // Rebuild the origin from the validated parts instead of echoing the request header.
    res.vary("Origin");
    // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration
    res.set("Access-Control-Allow-Origin", `${match[1]}://${match[2]}${match[3] ?? ""}`);
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, PATCH");
      res.set("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "");
      res.sendStatus(204);
      return;
    }
  }
  next();
});


// Health check: Flisk uses this endpoint to check service health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.get("/health/live", (_req, res) => {
  res.json({ status: "alive", timestamp: Date.now() });
});

app.get("/health/ready", async (_req, res) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  try {
    await pool.query("SELECT 1");
    dependencies.postgres = "ok";
  } catch {
    dependencies.postgres = "down";
    allReady = false;
  }

  const status = allReady ? "ready" : "not_ready";
  res.status(allReady ? 200 : 503).json({ status, dependencies });
});

// CRUD for the items table the migrator created.
const toItem = (row: { id: number; title: string; done: boolean; created_at: Date }) => ({
  id: row.id,
  title: row.title,
  done: row.done,
  createdAt: row.created_at,
});

app.get("/items", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM items ORDER BY id");
  res.json(rows.map(toItem));
});

app.post("/items", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title || title.length > 200) {
    res.status(400).json({ error: "title is required, up to 200 characters" });
    return;
  }
  const { rows } = await pool.query("INSERT INTO items (title) VALUES ($1) RETURNING *", [title]);
  res.status(201).json(toItem(rows[0]));
});

app.patch("/items/:id", async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE items SET title = COALESCE($2, title), done = COALESCE($3, done) WHERE id = $1 RETURNING *",
    [
      req.params.id,
      typeof req.body?.title === "string" ? req.body.title.trim() || null : null,
      typeof req.body?.done === "boolean" ? req.body.done : null,
    ],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(toItem(rows[0]));
});

app.delete("/items/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM items WHERE id = $1", [req.params.id]);
  res.sendStatus(result.rowCount === 0 ? 404 : 204);
});

app.get("/", (_req, res) => {
  res.json({
    service: "api",
    version: "1.0.0",
    endpoints: ["/health", "/items"],
  });
});

const envPort = Number(process.env.PORT);
const port = Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535 ? envPort : 3000;

// Bind beyond loopback: Traefik reaches the container over the Docker network.
app.listen(port, "0.0.0.0", () => {
  console.log("\n🚀 api running on http://localhost:" + port);
  console.log("📊 Health check: http://localhost:" + port + "/health\n");
});
