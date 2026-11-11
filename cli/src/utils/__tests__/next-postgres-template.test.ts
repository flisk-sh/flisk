// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The next-postgres starter: the commands it runs and the files it writes over their stubs. The whole stack is tested live
// by running `flisk --template next-postgres` and `flisk up`.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NEXT_POSTGRES_STEPS, writeNextPostgresFiles } from "../next-postgres-template.js";
import { PROJECT_TEMPLATES } from "../project-templates.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("next-postgres template", () => {
  it("is composed from an empty project and three resource commands", () => {
    expect(PROJECT_TEMPLATES["next-postgres"]?.composed).toBe("next-postgres");
    expect(NEXT_POSTGRES_STEPS.map((step) => step.slice(0, 2).join(" "))).toEqual([
      "project --yes",
      "resource db",
      "resource api",
      "resource web",
    ]);
    // --feature prisma is what adds the api-migrator resource and makes the API wait for it.
    expect(NEXT_POSTGRES_STEPS[2]).toContain("prisma");
    expect(NEXT_POSTGRES_STEPS[1]).toEqual(expect.arrayContaining(["database", "postgres"]));
    expect(NEXT_POSTGRES_STEPS[3]).toEqual(expect.arrayContaining(["frontend", "next"]));
  });

  it("writes the migration, the CRUD API and the page over the stubs, named after the folder", () => {
    const parent = mkdtempSync(join(tmpdir(), "next-postgres-"));
    dirs.push(parent);
    const dir = join(parent, "shop");
    const stub = join(dir, "services/app/web/src/app/health-card.tsx");
    mkdirSync(join(dir, "services/app/web/src/app"), { recursive: true });
    writeFileSync(stub, "stub");
    mkdirSync(join(dir, "services/app/api"), { recursive: true });
    writeFileSync(
      join(dir, "services/app/api/package.json"),
      JSON.stringify({ name: "api", dependencies: { express: "^5.0.0" } }),
    );

    writeNextPostgresFiles(dir);

    const read = (path: string) => readFileSync(join(dir, path), "utf-8");
    expect(existsSync(stub)).toBe(false);
    expect(
      read("services/app/api-migrator/prisma/migrations/20261111000000_create_items/migration.sql"),
    ).toContain('CREATE TABLE "items"');
    expect(read("services/app/api-migrator/prisma/schema.prisma")).toBe(
      read("services/app/api/prisma/schema.prisma"),
    );
    const api = read("services/app/api/src/index.ts");
    for (const route of [
      'get("/items"',
      'post("/items"',
      'patch("/items/:id"',
      'delete("/items/:id"',
    ]) {
      expect(api).toContain(`app.${route}`);
    }
    // The API imports express-rate-limit, so the project must declare it.
    expect(api).toContain("express-rate-limit");
    expect(JSON.parse(read("services/app/api/package.json")).dependencies).toMatchObject({
      express: "^5.0.0",
      "express-rate-limit": expect.any(String),
    });
    expect(read("services/app/web/src/app/page.tsx")).toContain("shop");
    expect(read("services/app/web/src/app/page.tsx")).not.toContain("__APP_NAME__");
    expect(read("README.md")).toMatch(/^# shop/);
  });
});
