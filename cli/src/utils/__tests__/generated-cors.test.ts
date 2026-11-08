// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { BACKEND_FRAMEWORKS } from "../../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES } from "../../backend-languages/registry.js";
import { LOCAL_FRONTEND_ORIGIN_PATTERN, localFrontendOriginConst } from "../generated-cors.js";

const rule = new RegExp(LOCAL_FRONTEND_ORIGIN_PATTERN);

describe("the local frontend origin rule", () => {
  it.each([
    "http://app.shop.localhost",
    "http://app.shop.localhost:8080",
    "https://app.my-shop.localhost:8443",
    "http://shop.localhost:3000",
  ])("allows %s", (origin) => {
    expect(rule.test(origin)).toBe(true);
  });

  it.each([
    "http://localhost:3000",
    "http://evil.com",
    "http://app.shop.localhost.evil.com",
    "http://evil.com/.localhost",
    "ftp://app.shop.localhost",
    "",
  ])("refuses %j", (origin) => {
    expect(rule.test(origin)).toBe(false);
  });

  it("is a valid JavaScript regular expression when scaffolded", () => {
    const declared = localFrontendOriginConst().match(/= \/(.*)\/;$/)?.[1] ?? "";

    expect(new RegExp(declared).source).toBe(rule.source);
  });
});

/** The source files a backend scaffolds, joined, whatever kind of provider writes them. */
function scaffoldedSources(): Array<[string, string]> {
  const frameworks = Object.values(BACKEND_FRAMEWORKS).map((provider): [string, string] => [
    provider.id,
    provider.createIndex("shop-api"),
  ]);
  const languages = Object.values(BACKEND_LANGUAGES)
    .filter((provider) => provider.createFiles)
    .map((provider): [string, string] => [
      provider.id,
      (provider.createFiles?.("shop-api") ?? []).map((file) => file.content).join("\n"),
    ]);
  return [...frameworks, ...languages];
}

describe("scaffolded backends", () => {
  const sources = scaffoldedSources();

  it("cover every backend language and framework", () => {
    expect(sources.map(([id]) => id)).toEqual(
      expect.arrayContaining([
        "hono",
        "express",
        "elysia",
        "fastify",
        "h3",
        "koa",
        "nestjs",
        "node",
        "python",
        "go",
        "rust",
      ]),
    );
  });

  it.each(sources)("%s lets a local frontend call the API, and nothing else", (_id, source) => {
    const usesTheRule =
      source.includes(LOCAL_FRONTEND_ORIGIN_PATTERN) || source.includes(localFrontendOriginConst());

    expect(usesTheRule).toBe(true);
    expect(source).not.toMatch(/Access-Control-Allow-Origin["'], ["']\*/);
    expect(source).not.toContain("allow_origins");
    expect(source).not.toContain("origin: '*'");
  });
});
