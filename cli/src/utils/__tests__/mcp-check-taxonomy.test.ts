// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { isFinalNetworkError } from "../mcp-check/taxonomy.js";

const node = { cause: { code: "ECONNREFUSED" } };
const bun = { code: "ECONNREFUSED" };

// [case, target, error, is the failure final?]
const table: Array<[string, string, unknown, boolean]> = [
  // A refused connection on this machine is final, whichever runtime reported it.
  ["localhost, code on the cause (Node)", "http://localhost:9/mcp", node, true],
  ["localhost, code on the error (Bun)", "http://localhost:9/mcp", bun, true],
  [
    "localhost, Bun's ConnectionRefused",
    "http://localhost:9/",
    { code: "ConnectionRefused" },
    true,
  ],
  [
    "localhost, ConnectionRefused on the cause",
    "http://localhost:9/",
    { cause: { code: "ConnectionRefused" } },
    true,
  ],
  ["a *.localhost subdomain", "http://api.test.localhost:8080/mcp", node, true],
  ["127.0.0.1", "http://127.0.0.1:9/mcp", node, true],
  ["another address in 127.0.0.0/8", "http://127.1.2.3/mcp", node, true],
  ["IPv6 loopback [::1]", "http://[::1]:9/mcp", node, true],
  ["an upper-case LOCALHOST", "http://LOCALHOST:9/mcp", node, true],

  // Anything else is retryable.
  ["a refused connection to another host", "https://mcp.example.com/mcp", node, false],
  ["127.0.0.1 as a subdomain of another host", "http://127.0.0.1.example.com/mcp", node, false],
  ["localhost as a subdomain of another host", "http://localhost.example.com/mcp", node, false],
  ["an address just outside 127.0.0.0/8", "http://128.0.0.1/mcp", node, false],
  [
    "a reset connection on loopback",
    "http://localhost:9/mcp",
    { cause: { code: "ECONNRESET" } },
    false,
  ],
  ["an error with no code, on loopback", "http://localhost:9/mcp", new Error("timeout"), false],
  ["a null error", "http://localhost:9/mcp", null, false],
  ["an unreadable URL", "not a url", node, false],
];

describe("isFinalNetworkError", () => {
  it.each(table)("%s", (_name, target, error, expected) => {
    expect(isFinalNetworkError(target, error)).toBe(expected);
  });
});
