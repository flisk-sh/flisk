// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Tests for the Night City PostgreSQL client (pg.mjs), which is its own small driver.
//
// Most cases talk to a fake server in this file that speaks the same wire protocol, so they run anywhere with no Docker.
// The cases at the end need a real PostgreSQL that accepts trust authentication; they run only when PG_TEST_PORT is set:
//
//   node --test tests/e2e/journeys/night-city/project/lib/pg.test.mjs
//   PG_TEST_PORT=5432 PG_TEST_USER=nc PG_TEST_DATABASE=nightcity node --test .../pg.test.mjs
import assert from "node:assert/strict";
import net from "node:net";
import { after, describe, test } from "node:test";

// The client reads these once, when it loads: make the timeout cases short.
process.env.PG_READ_TIMEOUT_MS = "400";
process.env.PG_CONNECT_TIMEOUT_MS = "400";
const { connect, int, lit, withDb } = await import("./pg.mjs");

// ------------------------------------------------------------------------------------------------------- fake server

const message = (type, body = Buffer.alloc(0)) => {
  const head = Buffer.alloc(5);
  head.write(type, 0);
  head.writeInt32BE(4 + body.length, 1);
  return Buffer.concat([head, body]);
};
const int16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const int32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const authOk = () => message("R", int32(0));
const ready = () => message("Z", Buffer.from("I"));
/** RowDescription for the column names. */
const columns = (...names) =>
  message("T", Buffer.concat([int16(names.length), ...names.map((n) => Buffer.concat([Buffer.from(`${n}\0`), Buffer.alloc(18)]))]));
/** DataRow; null is SQL NULL. */
const row = (...values) =>
  message(
    "D",
    Buffer.concat([
      int16(values.length),
      ...values.map((v) => (v === null ? int32(-1) : Buffer.concat([int32(Buffer.byteLength(v)), Buffer.from(v)]))),
    ]),
  );
const complete = (tag = "SELECT") => message("C", Buffer.from(`${tag}\0`));
const errorResponse = (text) => message("E", Buffer.from(`SERROR\0C42P01\0M${text}\0\0`));

/** Starts a fake server. `answer(sql, socket)` returns the messages to send after a query (without ReadyForQuery). */
async function fakeServer(answer, { greeting = [authOk()] } = {}) {
  const sockets = new Set();
  const queries = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    let started = false;
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (!started) {
          if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return;
          buffer = buffer.subarray(buffer.readInt32BE(0));
          started = true;
          socket.write(Buffer.concat([...greeting, ready()]));
          continue;
        }
        if (buffer.length < 5 || buffer.length < 1 + buffer.readInt32BE(1)) return;
        const type = String.fromCharCode(buffer[0]);
        const length = buffer.readInt32BE(1);
        const body = buffer.subarray(5, 1 + length);
        buffer = buffer.subarray(1 + length);
        if (type === "X") return socket.end();
        const sql = body.toString("utf8").replace(/\0$/, "");
        queries.push(sql);
        const reply = answer(sql, socket);
        if (reply) socket.write(Buffer.concat([...reply, ready()]));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    queries,
    connections: () => sockets.size,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

const servers = [];
after(() => {
  for (const server of servers) server.close();
});
async function client(answer, options) {
  const server = await fakeServer(answer, options);
  servers.push(server);
  const db = await connect({ port: server.port, user: "nc", database: "nightcity" });
  return { server, db };
}

// ------------------------------------------------------------------------------------------------------------ tests

describe("results", () => {
  test("a query returns every row, with columns as keys", async () => {
    const { db } = await client(() => [columns("id", "name"), row("1", "Rache"), row("2", "Maelstrom"), row("3", "Voodoo"), complete()]);
    assert.deepEqual(await db.query("select id, name from fixers"), [
      { id: "1", name: "Rache" },
      { id: "2", name: "Maelstrom" },
      { id: "3", name: "Voodoo" },
    ]);
    db.close();
  });

  test("SQL NULL is null and an empty string stays an empty string", async () => {
    const { db } = await client(() => [columns("a", "b", "c"), row(null, "", "x"), complete()]);
    assert.deepEqual(await db.query("select"), [{ a: null, b: "", c: "x" }]);
    db.close();
  });

  test("multi-byte text keeps its byte lengths: accents, CJK and emoji", async () => {
    const text = "Zürich 夜の街 🌃 ñ";
    const { db } = await client(() => [columns("v", "w"), row(text, "after"), complete()]);
    assert.deepEqual(await db.query("select"), [{ v: text, w: "after" }]);
    db.close();
  });

  test("a statement with no rows returns an empty list", async () => {
    const { db } = await client(() => [complete("INSERT 0 1")]);
    assert.deepEqual(await db.query("insert into t values (1)"), []);
    db.close();
  });

  test("several statements in one query return the rows of the last result set", async () => {
    const { db } = await client(() => [
      complete("BEGIN"),
      columns("first"),
      row("a"),
      complete(),
      columns("second"),
      row("b"),
      row("c"),
      complete(),
      complete("COMMIT"),
    ]);
    assert.deepEqual(await db.query("begin; select 'a'; select 'b'; commit"), [{ second: "b" }, { second: "c" }]);
    db.close();
  });
});

describe("one connection, several queries", () => {
  test("a transaction runs its statements in order on the same connection", async () => {
    const { server, db } = await client((sql) => (sql === "SELECT 1" ? [columns("n"), row("1"), complete()] : [complete(sql)]));
    await db.query("BEGIN");
    await db.query("INSERT INTO t VALUES (1)");
    assert.deepEqual(await db.query("SELECT 1"), [{ n: "1" }]);
    await db.query("COMMIT");
    assert.deepEqual(server.queries, ["BEGIN", "INSERT INTO t VALUES (1)", "SELECT 1", "COMMIT"]);
    assert.equal(server.connections(), 1);
    db.close();
  });

  test("the sql is sent as UTF-8 and ends the way the protocol wants", async () => {
    const { server, db } = await client(() => [complete()]);
    await db.query("select 'Zürich 🌃'");
    assert.deepEqual(server.queries, ["select 'Zürich 🌃'"]);
    db.close();
  });
});

describe("failures", () => {
  test("an error response rejects with the server's message, and the connection stays usable", async () => {
    const { db } = await client((sql) => (sql.includes("missing") ? [errorResponse('relation "missing" does not exist')] : [columns("ok"), row("yes"), complete()]));
    await assert.rejects(db.query("select * from missing"), /relation "missing" does not exist/);
    assert.deepEqual(await db.query("select 1"), [{ ok: "yes" }]);
    db.close();
  });

  test("a connection that closes during a query rejects", async () => {
    const { db } = await client((_sql, socket) => {
      socket.destroy();
      return null;
    });
    await assert.rejects(db.query("select 1"), /closed|ECONNRESET|read/i);
  });

  test("a server that accepts but never answers is cut off by the read timeout", async () => {
    const { db } = await client(() => null);
    const started = Date.now();
    await assert.rejects(db.query("select 1"), /sent nothing for 400 ms/);
    assert.ok(Date.now() - started < 3000, "the timeout must fire in about 400 ms");
  });

  test("a server that never finishes its startup is cut off too", async () => {
    const silent = net.createServer(() => {}).listen(0, "127.0.0.1");
    await new Promise((resolve) => silent.once("listening", resolve));
    await assert.rejects(connect({ port: silent.address().port, user: "nc", database: "nightcity" }), /sent nothing for 400 ms/);
    silent.close();
  });

  test("nothing listening is an error, not a hang", async () => {
    const probe = net.createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => probe.once("listening", resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    await assert.rejects(connect({ port, user: "nc", database: "nightcity" }), /ECONNREFUSED/);
  });

  test("a server that wants a password is refused with a clear message", async () => {
    const server = await fakeServer(() => null, { greeting: [message("R", int32(10))] });
    servers.push(server);
    await assert.rejects(connect({ port: server.port, user: "nc", database: "nightcity" }), /trust authentication/);
  });

  test("an error at startup rejects with the server's message", async () => {
    const server = await fakeServer(() => null, { greeting: [errorResponse('database "nightcity" does not exist')] });
    servers.push(server);
    await assert.rejects(connect({ port: server.port, user: "nc", database: "nightcity" }), /database "nightcity" does not exist/);
  });
});

describe("withDb", () => {
  test("runs the work, returns its value and closes the connection", async () => {
    const server = await fakeServer(() => [columns("n"), row("7"), complete()]);
    servers.push(server);
    const value = await withDb({ port: server.port, user: "nc", database: "nightcity" }, async (query) => (await query("select 7"))[0].n);
    assert.equal(value, "7");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(server.connections(), 0);
  });

  test("closes the connection when the work throws", async () => {
    const server = await fakeServer(() => [errorResponse("boom")]);
    servers.push(server);
    await assert.rejects(withDb({ port: server.port, user: "nc", database: "nightcity" }, (query) => query("select 1")), /boom/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(server.connections(), 0);
  });

  test("retries a refused connection until waitMs has passed, then throws", async () => {
    const probe = net.createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => probe.once("listening", resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    const started = Date.now();
    await assert.rejects(withDb({ port, user: "nc", database: "nightcity" }, async () => {}, { waitMs: 1200 }), /ECONNREFUSED/);
    assert.ok(Date.now() - started >= 1000, "it must keep trying for about waitMs");
  });
});

describe("literals", () => {
  test("lit doubles quotes, drops NUL and quotes everything else as it is", () => {
    assert.equal(lit("o'brien"), "'o''brien'");
    assert.equal(lit("a\0b"), "'ab'");
    assert.equal(lit("back\\slash\nnewline"), "'back\\slash\nnewline'");
    assert.equal(lit("'; DROP TABLE gigs; --"), "'''; DROP TABLE gigs; --'");
    assert.equal(lit(42), "'42'");
  });

  test("int accepts integers and refuses anything that could carry SQL", () => {
    assert.equal(int("12"), 12);
    assert.equal(int(0), 0);
    for (const bad of ["1; DROP TABLE gigs", "1.5", "", "abc", NaN, undefined]) {
      assert.throws(() => int(bad), /not an integer/, String(bad));
    }
  });
});

// ------------------------------------------------------------------------------------------ against a real PostgreSQL

const realConfig = process.env.PG_TEST_PORT
  ? { port: process.env.PG_TEST_PORT, user: process.env.PG_TEST_USER ?? "nc", database: process.env.PG_TEST_DATABASE ?? "nightcity" }
  : null;

describe("a real PostgreSQL", { skip: realConfig ? false : "set PG_TEST_PORT to a trust-auth PostgreSQL to run these" }, () => {
  test("quotes, backslashes, newlines, Unicode and injection attempts round-trip through lit()", async () => {
    const values = ["o'brien", "back\\slash", "two\nlines", "Zürich 夜の街 🌃", "'; DROP TABLE gigs; --", "", "%_"];
    await withDb(realConfig, async (query) => {
      for (const value of values) {
        assert.deepEqual(await query(`SELECT ${lit(value)} AS v`), [{ v: value }], JSON.stringify(value));
      }
    });
  });

  test("NULL and several rows come back as the fake server's cases say", async () => {
    await withDb(realConfig, async (query) => {
      assert.deepEqual(await query("SELECT NULL AS a, '' AS b"), [{ a: null, b: "" }]);
      const rows = await query("SELECT g AS n FROM generate_series(1, 3) g ORDER BY g");
      assert.deepEqual(rows, [{ n: "1" }, { n: "2" }, { n: "3" }]);
    });
  });

  test("a real error response rejects and the connection is still usable", async () => {
    await withDb(realConfig, async (query) => {
      await assert.rejects(query("SELECT * FROM night_city_no_such_table"), /does not exist/);
      assert.deepEqual(await query("SELECT 1 AS ok"), [{ ok: "1" }]);
    });
  });

  test("a transaction rolls back and commits on one connection", async () => {
    await withDb(realConfig, async (query) => {
      await query("CREATE TEMP TABLE pg_client_test (v integer)");
      await query("BEGIN");
      await query("INSERT INTO pg_client_test VALUES (1)");
      await query("ROLLBACK");
      assert.deepEqual(await query("SELECT count(*) AS n FROM pg_client_test"), [{ n: "0" }]);
      await query("BEGIN");
      await query("INSERT INTO pg_client_test VALUES (2)");
      await query("COMMIT");
      assert.deepEqual(await query("SELECT v FROM pg_client_test"), [{ v: "2" }]);
    });
  });

  test("a multi-statement query returns the last result set", async () => {
    await withDb(realConfig, async (query) => {
      assert.deepEqual(await query("SELECT 1 AS a; SELECT 2 AS b"), [{ b: "2" }]);
    });
  });
});
