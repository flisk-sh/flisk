// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Netwatch: the gig board. A human posts a gig over HTTP; the dispatcher agent splits it into jobs; fixers claim and finish them.
// Every state change is a row in PostgreSQL, so a restart of this service loses nothing. Same shape as the swarm coordinator
// (/claim, /complete), with the queue in a database instead of a JSON file.
import { createServer } from "node:http";
import { configFromEnv, int, lit, withDb } from "../lib/pg.mjs";

const db = configFromEnv();
const CLAIM_MS = int(process.env.CLAIM_MS ?? 6000);
const MAX_TITLE = 500;

const run = (work) => withDb(db, work);

// One job at a time per worker: SKIP LOCKED lets three workers claim at once without ever taking the same row, and the
// (job_id, attempt) primary key of job_claims makes a duplicate claim an error instead of a silent second run.
async function claim(worker) {
  const rows = await run((query) =>
    query(`
      WITH picked AS (
        UPDATE jobs SET status = 'claimed', worker = ${lit(worker)}, attempts = attempts + 1, claimed_at = now()
        WHERE id = (
          SELECT id FROM jobs
          WHERE status = 'pending' OR (status = 'claimed' AND claimed_at < now() - (${CLAIM_MS} * interval '1 millisecond'))
          ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id, gig_id, seq, text, kind, attempts),
      logged AS (
        INSERT INTO job_claims (job_id, attempt, worker) SELECT id, attempts, ${lit(worker)} FROM picked)
      SELECT * FROM picked`),
  );
  return rows[0] ?? null;
}

async function complete({ id, attempt, worker, result }) {
  return run(async (query) => {
    await query("BEGIN");
    try {
      const done = await query(`
        UPDATE jobs SET status = 'done', result = ${lit(result)}, finished_at = now()
        WHERE id = ${int(id)} AND status = 'claimed' AND attempts = ${int(attempt)} AND worker = ${lit(worker)}
        RETURNING gig_id`);
      if (done.length === 0) {
        await query("ROLLBACK");
        return false;
      }
      const gig = int(done[0].gig_id);
      await query(`UPDATE job_claims SET finished_at = now() WHERE job_id = ${int(id)} AND attempt = ${int(attempt)}`);
      // Lock the gig, so two workers finishing its last two jobs at once cannot both see "one job left".
      await query(`SELECT id FROM gigs WHERE id = ${gig} FOR UPDATE`);
      await query(`
        UPDATE gigs SET status = 'done', finished_at = now(),
          result = (SELECT string_agg(result, ' | ' ORDER BY seq) FROM jobs WHERE gig_id = ${gig})
        WHERE id = ${gig} AND status = 'dispatched'
          AND NOT EXISTS (SELECT 1 FROM jobs WHERE gig_id = ${gig} AND status <> 'done')`);
      await query("COMMIT");
      return true;
    } catch (error) {
      await query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

async function addJobs(gigId, jobs) {
  return run(async (query) => {
    await query("BEGIN");
    try {
      const open = await query(`SELECT id FROM gigs WHERE id = ${int(gigId)} AND status = 'open' FOR UPDATE`);
      if (open.length === 0) {
        await query("ROLLBACK");
        return 0;
      }
      const values = jobs
        .map((job, index) => `(${int(gigId)}, ${index + 1}, ${lit(job.text)}, ${lit(job.kind)})`)
        .join(", ");
      await query(`INSERT INTO jobs (gig_id, seq, text, kind) VALUES ${values}`);
      await query(`UPDATE gigs SET status = 'dispatched' WHERE id = ${int(gigId)}`);
      await query("COMMIT");
      return jobs.length;
    } catch (error) {
      await query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 100_000) throw Object.assign(new Error("body too large"), { status: 413 });
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("body is not JSON"), { status: 400 });
  }
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  try {
    if (path === "/health") return send(response, 200, { ok: true });

    if (request.method === "POST" && path === "/gigs") {
      const { title } = await readBody(request);
      if (typeof title !== "string" || title.trim() === "" || title.length > MAX_TITLE) {
        return send(response, 400, { error: `title must be 1 to ${MAX_TITLE} characters` });
      }
      const rows = await run((query) => query(`INSERT INTO gigs (title) VALUES (${lit(title.trim())}) RETURNING id, status`));
      return send(response, 201, { id: Number(rows[0].id), status: rows[0].status });
    }

    if (request.method === "GET" && path === "/gigs") {
      const status = url.searchParams.get("status");
      const where = status ? `WHERE status = ${lit(status)}` : "";
      const rows = await run((query) => query(`SELECT id, title, status, result FROM gigs ${where} ORDER BY id`));
      return send(response, 200, { gigs: rows.map((row) => ({ ...row, id: Number(row.id) })) });
    }

    const gig = path.match(/^\/gigs\/(\d+)(\/jobs)?$/);
    if (gig && request.method === "GET" && !gig[2]) {
      const id = int(gig[1]);
      const [gigs, jobs] = await run(async (query) => [
        await query(`SELECT id, title, status, result FROM gigs WHERE id = ${id}`),
        await query(
          `SELECT id, seq, text, kind, status, worker, attempts, result FROM jobs WHERE gig_id = ${id} ORDER BY seq`,
        ),
      ]);
      if (gigs.length === 0) return send(response, 404, { error: "no such gig" });
      return send(response, 200, {
        gig: { ...gigs[0], id: Number(gigs[0].id) },
        jobs: jobs.map((job) => ({ ...job, id: Number(job.id), seq: Number(job.seq), attempts: Number(job.attempts) })),
      });
    }
    if (gig && request.method === "POST" && gig[2]) {
      const { jobs } = await readBody(request);
      const valid =
        Array.isArray(jobs) &&
        jobs.length > 0 &&
        jobs.length <= 50 &&
        jobs.every((job) => typeof job?.text === "string" && typeof job?.kind === "string");
      if (!valid) return send(response, 400, { error: "jobs must be a list of { text, kind }" });
      const created = await addJobs(gig[1], jobs);
      return send(response, created > 0 ? 201 : 409, { created });
    }

    if (request.method === "POST" && path === "/claim") {
      const { worker } = await readBody(request);
      if (typeof worker !== "string" || worker === "") return send(response, 400, { error: "worker is required" });
      const job = await claim(worker);
      return send(response, 200, {
        task: job && { id: Number(job.id), attempt: Number(job.attempts), kind: job.kind, text: job.text },
      });
    }
    if (request.method === "POST" && path === "/complete") {
      const body = await readBody(request);
      const accepted = await complete(body);
      return send(response, accepted ? 200 : 409, { accepted });
    }
  } catch (error) {
    const status = error.status ?? 500;
    if (status === 500) console.error(`netwatch: ${error.stack ?? error}`);
    return send(response, status, { error: error.message });
  }
  send(response, 404, { error: "not found" });
});

server.listen(Number(process.env.PORT));
