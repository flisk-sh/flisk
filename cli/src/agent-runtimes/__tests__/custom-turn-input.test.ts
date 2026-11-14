// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { getCustomAgentIndexTemplate } from "../custom.js";

// Pull `readJson` (plus the limit constant and error it depends on) out of a generated
// index and run it, so the test checks the shipped helper's behaviour.
function loadReadJson(source: string) {
  const start = source.indexOf("const MAX_TURN_BODY_BYTES");
  expect(start).toBeGreaterThan(-1);
  const rawReturn = source.indexOf("return raw ? JSON.parse(raw) : {};", start);
  expect(rawReturn).toBeGreaterThan(-1);
  const end = source.indexOf("}\n", rawReturn);
  expect(end).toBeGreaterThan(start);
  const js = source
    .slice(start, end + 2)
    .replace(
      "async function readJson(req: IncomingMessage): Promise<any> {",
      "async function readJson(req) {",
    )
    .replace("const chunks: Buffer[] = [];", "const chunks = [];")
    .replace("totalBytes += (chunk as Buffer).length;", "totalBytes += chunk.length;")
    .replace("chunks.push(chunk as Buffer);", "chunks.push(chunk);");
  return new Function(`${js}\nreturn readJson;`)() as (req: unknown) => Promise<unknown>;
}

function mockReq(chunks: Buffer[]) {
  const pause = vi.fn();
  const destroy = vi.fn();
  return {
    pause,
    destroy,
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
}

describe.each(["files", "postgres"] as const)(
  "%s durability template: /turn body limit",
  (durability) => {
    const index = getCustomAgentIndexTemplate("support-agent", durability);

    it("caps the /turn body with a documented default, overridable by env", () => {
      expect(index).toContain(
        "const MAX_TURN_BODY_BYTES = Number(process.env.AGENT_MAX_TURN_BODY_BYTES) || 1_048_576;",
      );
      expect(index).toContain(
        "//   AGENT_MAX_TURN_BODY_BYTES  max POST /turn body in bytes (default 1048576); over the limit: 413 payload_too_large",
      );
    });

    it("answers an over-limit body with 413 payload_too_large and writes nothing", () => {
      expect(index).toContain("if (error instanceof PayloadTooLargeError) {");
      expect(index).toContain("sendJson(res, 413, { error: 'payload_too_large' });");
      expect(index).toContain("res.setHeader('connection', 'close');");
      // The 413 branch runs before the JSON-error branch, so an over-limit body is
      // never misread as invalid JSON.
      expect(index.indexOf("if (error instanceof PayloadTooLargeError) {")).toBeLessThan(
        index.indexOf("if (!(error instanceof SyntaxError)) throw error;"),
      );
    });

    it("counts bytes while streaming instead of buffering the whole body first", () => {
      expect(index).toContain("let totalBytes = 0;");
      expect(index).toContain("if (totalBytes > MAX_TURN_BODY_BYTES) {");
      expect(index).toContain("req.pause();");
      expect(index).toContain("throw new PayloadTooLargeError();");
    });
  },
);

describe("readJson body limit (limit+1 bytes)", () => {
  it("rejects a body one byte over the limit and pauses the stream", async () => {
    process.env.AGENT_MAX_TURN_BODY_BYTES = "10";
    try {
      const readJson = loadReadJson(getCustomAgentIndexTemplate("support-agent", "files"));
      const req = mockReq([Buffer.from('{"a":12345}')]); // 11 bytes, limit is 10
      await expect(readJson(req)).rejects.toThrow("request body exceeds AGENT_MAX_TURN_BODY_BYTES");
      expect(req.pause).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.AGENT_MAX_TURN_BODY_BYTES;
    }
  });

  it("accepts a body exactly at the limit", async () => {
    process.env.AGENT_MAX_TURN_BODY_BYTES = "10";
    try {
      const readJson = loadReadJson(getCustomAgentIndexTemplate("support-agent", "files"));
      const req = mockReq([Buffer.from('{"a":1234}')]); // exactly 10 bytes
      await expect(readJson(req)).resolves.toEqual({ a: 1234 });
      expect(req.pause).not.toHaveBeenCalled();
    } finally {
      delete process.env.AGENT_MAX_TURN_BODY_BYTES;
    }
  });

  it("accepts a small body split across chunks", async () => {
    const readJson = loadReadJson(getCustomAgentIndexTemplate("support-agent", "files"));
    const req = mockReq([Buffer.from('{"in'), Buffer.from('put":"hi"}')]);
    await expect(readJson(req)).resolves.toEqual({ input: "hi" });
    expect(req.pause).not.toHaveBeenCalled();
  });
});
