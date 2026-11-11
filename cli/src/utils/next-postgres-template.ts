// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";
import { type CliInvocation, cliInvocation } from "./cli-invocation.js";

/**
 * The next-postgres starter: a Next.js website, an Express API and a Postgres database, with a migrator that creates and seeds the
 * `items` table and a working create, tick and delete page. It is composed from the real commands, not copied from a repository:
 * an empty `flisk project`, then three `flisk resource` calls (`--feature prisma` adds the `api-migrator` resource and makes the
 * API wait for it). The files below then replace the stub code those commands wrote. It needs Docker, because of Postgres.
 */
export const NEXT_POSTGRES_STACK = "app";

/** The commands that write the project, in order. Each runs inside the new project folder. */
export const NEXT_POSTGRES_STEPS: string[][] = [
  ["project", "--yes"],
  [
    "resource",
    "db",
    "--type",
    "database",
    "--framework",
    "postgres",
    "--stack",
    NEXT_POSTGRES_STACK,
    "--yes",
  ],
  [
    "resource",
    "api",
    "--type",
    "backend",
    "--framework",
    "express",
    "--feature",
    "prisma",
    "--stack",
    NEXT_POSTGRES_STACK,
    "--yes",
  ],
  [
    "resource",
    "web",
    "--type",
    "frontend",
    "--framework",
    "next",
    "--stack",
    NEXT_POSTGRES_STACK,
    "--yes",
  ],
];

const APP = `services/${NEXT_POSTGRES_STACK}`;

/** Project path -> template path: what replaces the stub files the resource commands wrote. */
const TEMPLATE_FILES: Record<string, string> = {
  [`${APP}/api/src/index.ts`]: "next-postgres/api/index.ts",
  [`${APP}/api/prisma/schema.prisma`]: "next-postgres/schema.prisma",
  [`${APP}/api-migrator/prisma/schema.prisma`]: "next-postgres/schema.prisma",
  [`${APP}/api-migrator/prisma/migrations/migration_lock.toml`]:
    "next-postgres/migrator/migration_lock.toml",
  [`${APP}/api-migrator/prisma/migrations/20261111000000_create_items/migration.sql`]:
    "next-postgres/migrator/create_items.sql",
  [`${APP}/api-migrator/prisma/migrations/20261111000100_seed_items/migration.sql`]:
    "next-postgres/migrator/seed_items.sql",
  [`${APP}/web/src/app/layout.tsx`]: "next-postgres/web/layout.tsx",
  [`${APP}/web/src/app/page.tsx`]: "next-postgres/web/page.tsx",
  [`${APP}/web/src/app/items.tsx`]: "next-postgres/web/items.tsx",
  [`${APP}/web/src/app/globals.css`]: "next-postgres/web/globals.css",
};

/** The stub the web resource wrote that the new page no longer uses. */
const REMOVED_FILES = [`${APP}/web/src/app/health-card.tsx`];

const README = (name: string) => `# ${name}

A Next.js website, an Express API and a Postgres database, started with one command. Docker is needed (for Postgres).

\`\`\`bash
flisk up
\`\`\`

\`flisk up\` starts Postgres, runs the migrator once (it creates the \`items\` table and adds three rows), then starts the API and the
website. Open the \`web\` URL it prints and add, tick and delete items; every change is saved in Postgres.

| Resource | What it is |
| --- | --- |
| \`db\` | The shared Flisk Postgres |
| \`api-migrator\` | Runs \`prisma migrate deploy\` once, from \`${APP}/api-migrator/prisma/migrations\` |
| \`api\` | Express: \`GET/POST /items\`, \`PATCH/DELETE /items/:id\`, \`GET /health/ready\` |
| \`web\` | Next.js page that calls the API |

Change the table: add a folder with a \`migration.sql\` under \`api-migrator/prisma/migrations\`, then \`flisk restart api-migrator\`.
`;

/** Runs the project and resource commands with this CLI in `dir`; throws with the command's output when one fails. */
export function runNextPostgresSteps(
  dir: string,
  invocation: CliInvocation = cliInvocation(),
): void {
  const [command, ...prefix] = invocation;
  for (const step of NEXT_POSTGRES_STEPS) {
    const result = spawnSync(command, [...prefix, ...step], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(
        `flisk ${step.join(" ")} failed: ${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ")}`,
      );
    }
  }
}

/** Writes the files that replace the stubs, and removes the stub the page no longer uses. */
export function writeNextPostgresFiles(
  dir: string,
  readTemplate: (name: string) => string = loadTemplate,
): void {
  const name = basename(dir);
  const files: Record<string, string> = { "README.md": README(name) };
  for (const [target, source] of Object.entries(TEMPLATE_FILES)) {
    files[target] = readTemplate(source).replaceAll("__APP_NAME__", name);
  }
  for (const [path, contents] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  for (const path of REMOVED_FILES) rmSync(join(dir, path), { force: true });
}

/** Writes the whole next-postgres project into the empty folder `dir`. */
export function writeNextPostgresProject(dir: string): void {
  mkdirSync(dir, { recursive: true });
  runNextPostgresSteps(dir);
  writeNextPostgresFiles(dir);
}
