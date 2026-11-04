// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// A minimal PostgreSQL client for the Night City suite: the wire protocol's simple query flow over node:net, so the suite needs no
// npm package. It speaks to a throwaway Postgres on 127.0.0.1 that accepts trust authentication (no password, no secret).
import net from "node:net";

// A stalled database must fail the case with a message, not hang the CI job until its timeout.
const CONNECT_TIMEOUT_MS = Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 10_000);
/** How long the client waits for the next message of an answer. */
const READ_TIMEOUT_MS = Number(process.env.PG_READ_TIMEOUT_MS ?? 30_000);

/** A SQL string literal. Values from the outside (a gig's text) go through here; standard_conforming_strings is on. */
export function lit(value) {
  return `'${String(value).replaceAll("\0", "").replaceAll("'", "''")}'`;
}

/** An integer, or a thrown error: never interpolate anything else into a number position. */
export function int(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`not an integer: ${value}`);
  return n;
}

function reader(socket) {
  let buffer = Buffer.alloc(0);
  const queue = [];
  let wake = null;
  let failure = null;
  const notify = () => {
    if (wake) {
      const resume = wake;
      wake = null;
      resume();
    }
  };
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 5) {
      const length = buffer.readInt32BE(1);
      if (buffer.length < 1 + length) break;
      queue.push({ type: String.fromCharCode(buffer[0]), body: buffer.subarray(5, 1 + length) });
      buffer = buffer.subarray(1 + length);
    }
    notify();
  });
  socket.on("error", (error) => {
    failure = error;
    notify();
  });
  socket.on("close", () => {
    failure ??= new Error("postgres closed the connection");
    notify();
  });
  return async () => {
    const deadline = Date.now() + READ_TIMEOUT_MS;
    while (queue.length === 0) {
      if (failure) throw failure;
      const left = deadline - Date.now();
      if (left <= 0) {
        socket.destroy();
        throw new Error(`postgres sent nothing for ${READ_TIMEOUT_MS} ms`);
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, left);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    return queue.shift();
  };
}

function cstrings(body) {
  return body.toString("utf8").split("\0");
}

/** Opens a connection. `query(sql)` returns the rows (objects of text values) of the last result set; an error throws. */
export async function connect({ port, user, database, host = "127.0.0.1" }) {
  const socket = net.connect({ port: Number(port), host });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`postgres did not accept a connection on ${host}:${port} within ${CONNECT_TIMEOUT_MS} ms`));
    }, CONNECT_TIMEOUT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  const next = reader(socket);
  const params = Buffer.from(`user\0${user}\0database\0${database}\0\0`);
  const startup = Buffer.alloc(8);
  startup.writeInt32BE(8 + params.length, 0);
  startup.writeInt32BE(196608, 4);
  socket.write(Buffer.concat([startup, params]));
  for (;;) {
    const message = await next();
    if (message.type === "R" && message.body.readInt32BE(0) !== 0) {
      socket.destroy();
      throw new Error("postgres asked for a password, but the Night City database uses trust authentication");
    }
    if (message.type === "E") {
      socket.destroy();
      throw new Error(`postgres refused the connection: ${cstrings(message.body).join(" ")}`);
    }
    if (message.type === "Z") break;
  }

  async function query(sql) {
    const text = Buffer.from(`${sql}\0`);
    const head = Buffer.alloc(5);
    head.write("Q", 0);
    head.writeInt32BE(4 + text.length, 1);
    socket.write(Buffer.concat([head, text]));
    let columns = [];
    let rows = [];
    let error = null;
    for (;;) {
      const { type, body } = await next();
      if (type === "T") {
        columns = [];
        rows = [];
        let at = 2;
        for (let i = 0; i < body.readInt16BE(0); i++) {
          const end = body.indexOf(0, at);
          columns.push(body.toString("utf8", at, end));
          at = end + 19; // the name's NUL plus the 18 bytes of type information
        }
      } else if (type === "D") {
        const row = {};
        let at = 2;
        for (let i = 0; i < body.readInt16BE(0); i++) {
          const length = body.readInt32BE(at);
          at += 4;
          row[columns[i]] = length < 0 ? null : body.toString("utf8", at, at + length);
          if (length > 0) at += length;
        }
        rows.push(row);
      } else if (type === "E") {
        error = cstrings(body)
          .filter((field) => field.startsWith("M"))
          .map((field) => field.slice(1))
          .join(" ");
      } else if (type === "Z") {
        break;
      }
    }
    if (error) throw new Error(error);
    return rows;
  }

  const close = () => {
    try {
      socket.end(Buffer.from([0x58, 0, 0, 0, 4]));
    } catch {
      socket.destroy();
    }
  };
  return { query, close };
}

/** Runs `work(query)` on a fresh connection and closes it. Connection errors are retried until the database accepts. */
export async function withDb(config, work, { waitMs = 0 } = {}) {
  const deadline = Date.now() + waitMs;
  let client;
  for (;;) {
    try {
      client = await connect(config);
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  try {
    return await work(client.query);
  } finally {
    client.close();
  }
}

export function configFromEnv() {
  return {
    port: process.env.PG_PORT,
    user: process.env.PG_USER ?? "nc",
    database: process.env.PG_DATABASE ?? "nightcity",
  };
}
