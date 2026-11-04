// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/index.js";
import {
  checkRemoteEnvHosts,
  hostOfValue,
  isLocalHost,
  scanRemoteEnvHosts,
} from "../remote-env-hosts.js";

const SECRET = "s3cr3t-password-value";

function project(): string {
  const root = createTempDir();
  mkdirSync(join(root, ".flisk"), { recursive: true });
  writeFileSync(join(root, ".flisk", "project.json"), JSON.stringify({ project: { name: "p" } }));
  return root;
}

function service(
  root: string,
  name: string,
  config: Record<string, unknown>,
  files: Record<string, string> = {},
) {
  const dir = join(root, "services", "shop", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "service.json"),
    JSON.stringify({
      schemaVersion: 1,
      appName: name,
      appType: "backend",
      stack: "shop",
      port: 4000,
      ...config,
    }),
  );
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
}

describe("remote hosts in env (#2874)", () => {
  it("reads the host of a URL or a *_HOST value, and nothing else", () => {
    expect(hostOfValue("API_URL", "https://api.example.com/v1")).toBe("api.example.com");
    expect(
      hostOfValue("DATABASE_URL", `postgres://app:${SECRET}@db.prod.example.com:5432/app`),
    ).toBe("db.prod.example.com");
    expect(hostOfValue("REDIS_HOST", "cache.example.com:6379")).toBe("cache.example.com");
    expect(hostOfValue("GREETING", "hello world")).toBeUndefined();
    expect(hostOfValue("API_URL", "http://${API_HOST}/v1")).toBeUndefined();
    expect(hostOfValue("TOKEN", "abc.def.ghi")).toBeUndefined();
  });

  it("treats localhost, local suffixes, private IPs, one-word names and allowed hosts as local", () => {
    const names = new Set(["orders-api"]);
    for (const host of [
      "localhost",
      "shop.localhost",
      "shop.backend.p.local",
      "host.docker.internal",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.5",
      "::1",
      "postgres",
      "orders-api",
    ]) {
      expect(isLocalHost(host, names), host).toBe(true);
    }
    expect(isLocalHost("api.example.com", names)).toBe(false);
    expect(isLocalHost("8.8.8.8", names)).toBe(false);
    expect(isLocalHost("api.stripe.com", names, ["api.stripe.com"])).toBe(true);
    expect(isLocalHost("eu.api.openai.com", names, ["*.openai.com"])).toBe(true);
  });

  it("finds remote hosts in the project .env, service.json env and params, and service env files", () => {
    const root = project();
    writeFileSync(
      join(root, ".env"),
      `AUTH_ISSUER=https://auth.shared-dev.example.com\nLOCAL=http://localhost:3000\n`,
    );
    service(
      root,
      "orders-api",
      {
        env: {
          PAYMENTS_URL: "https://payments.example.com",
          INVENTORY_URL: "http://inventory-api:4001",
        },
        params: { DB_HOST: "db.prod.example.com" },
      },
      { ".env.local": `DATABASE_URL=postgres://app:${SECRET}@db.shared.example.com/app\n` },
    );

    expect(scanRemoteEnvHosts(root)).toEqual([
      {
        service: "(project)",
        variable: "AUTH_ISSUER",
        host: "auth.shared-dev.example.com",
        source: ".env",
      },
      {
        service: "orders-api",
        variable: "PAYMENTS_URL",
        host: "payments.example.com",
        source: "service.json env",
      },
      {
        service: "orders-api",
        variable: "DB_HOST",
        host: "db.prod.example.com",
        source: "service.json params",
      },
      {
        service: "orders-api",
        variable: "DATABASE_URL",
        host: "db.shared.example.com",
        source: join("services", "shop", "orders-api", ".env.local"),
      },
    ]);
  });

  it("warns by default, fails with --strict, and never prints a value", () => {
    const root = project();
    service(root, "orders-api", {
      env: { DATABASE_URL: `postgres://app:${SECRET}@db.prod.example.com/app` },
    });

    const warning = checkRemoteEnvHosts(root);
    expect(warning).toMatchObject({ didPass: true, isWarning: true });
    expect(warning.message).toContain(
      "orders-api DATABASE_URL -> db.prod.example.com (service.json env)",
    );
    expect(JSON.stringify(warning)).not.toContain(SECRET);
    expect(checkRemoteEnvHosts(root, true)).toMatchObject({ didPass: false, isWarning: false });
  });

  it("passes when every host is local or allowed", () => {
    const root = project();
    writeFileSync(
      join(root, ".flisk", "project.json"),
      JSON.stringify({ project: { name: "p" }, allowedHosts: ["*.stripe.com"] }),
    );
    service(root, "orders-api", {
      env: { STRIPE_URL: "https://api.stripe.com", INVENTORY_URL: "http://inventory-api:4001" },
    });
    expect(checkRemoteEnvHosts(root)).toMatchObject({
      didPass: true,
      message: "Every host in the env points at the local stack",
    });
  });
});
