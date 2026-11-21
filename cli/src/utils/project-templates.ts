// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ProjectTemplate {
  repo: string;
  description: string;
  bundledPath?: string;
  /** Written by the CLI itself from `cli/templates`, with no clone: `swarm` or `security`. */
  generated?: "swarm" | "security" | "super-agent" | "langgraph" | "tool-loop";
  /** Written by running `flisk project` and `flisk resource` in the new folder, then adding files; needs Docker. */
  composed?: "next-postgres";
  fixedDir?: string;
  /** Paths copied from the template that are presentation material, not part of the user's project (#4301, #4285). */
  omit?: readonly string[];
  /** A commit SHA: project creation checks out exactly this commit after cloning, instead of the default branch. */
  ref?: string;
}

/** One row of the template catalog that `flisk project --list --json` and the `project_templates` MCP tool return. */
export interface ProjectTemplateEntry {
  key: string;
  repo: string;
  description: string;
  /** What the starter needs to run, in the same words create's `needs:` line uses. */
  needs: string;
  ref?: string;
}

/** True when a starter is written by the CLI and runs as local processes, with no Docker. */
export function runsLocally(template: ProjectTemplate): boolean {
  return template.generated !== undefined;
}

/**
 * The one wording for what a starter needs, shared by `flisk project --list` and the `needs:` line of
 * `flisk create --starter <key> --dry-run`. Both read the same fact about the starter from this catalog.
 */
export function starterNeeds(key: string): string {
  const template = PROJECT_TEMPLATES[key];
  return template && runsLocally(template)
    ? "runs on this computer; no Docker, no database"
    : "Docker (its README says what else)";
}

/** Public starter repositories plus the bundled default product example. */
export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  demo: {
    repo: "https://github.com/flisk-sh/flisk-restaurant-example.git",
    description: "Restaurant demo: take table bookings, run the kitchen and manage the dining room",
    fixedDir: "flisk-demo",
    omit: ["DEMO_GUIDE.md"],
  },
  restaurant: {
    repo: "https://github.com/flisk-sh/flisk-restaurant-example.git",
    description: "Restaurant app: table bookings, kitchen orders and the dining room in one place",
    omit: ["DEMO_GUIDE.md"],
  },
  saas: {
    repo: "https://github.com/flisk-sh/flisk-saas-starter.git",
    description: "Online subscription app: a customer account page and a working payment button",
    omit: ["DEMO_GUIDE.md"],
  },
  erp: {
    repo: "https://github.com/flisk-sh/flisk-erp-system.git",
    description: "Company back office: 100 small services for sales, stock, finance and more",
    omit: ["SALES_PITCH.md", "DEMO_GUIDE.md"],
  },
  "user-management": {
    repo: "https://github.com/flisk-sh/flisk-user-management.git",
    description: "Sign-up and log-in: user accounts, passwords and who may do what",
    omit: ["SALES_PITCH.md", "DEMO_GUIDE.md"],
  },
  ecommerce: {
    repo: "https://github.com/flisk-sh/flisk-ecommerce-example.git",
    description: "Online shop: a shop front with a product catalogue",
  },
  example: {
    repo: "https://github.com/flisk-sh/flisk-example.git",
    bundledPath: "examples/flisk-example",
    description: "Order tracker: a web page that saves orders and finishes work in the background",
  },
  "agent-stack": {
    repo: "https://github.com/flisk-sh/flisk-agent-stack.git",
    description: "AI assistant: an assistant that can use tools and remember what it did",
  },
  swarm: {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "swarm",
    description: "AI team: one assistant splits a goal into tasks and three helpers finish them",
  },
  security: {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "security",
    description:
      "Security checker: one assistant scans, one sorts what it found, one writes the report",
  },
  "super-agent": {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "super-agent",
    description:
      "AI researcher: plans a task, looks things up, writes and checks the result (uses Claude when you add an Anthropic key)",
  },
  langgraph: {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "langgraph",
    description:
      "Step-by-step AI writer: plans, researches, writes and checks, and picks up where it stopped",
  },
  "tool-loop": {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "tool-loop",
    description:
      "Simple AI helper: an assistant that uses tools, with a practice model so it works offline",
  },
  "next-postgres": {
    repo: "https://github.com/flisk-sh/flisk.git",
    composed: "next-postgres",
    description:
      "Next.js + Postgres app: a website with a working add, tick and delete list, an API and a migrator (needs Docker)",
  },
  launch: {
    repo: "https://github.com/flisk-sh/flisk-template-launch.git",
    ref: "f97e03a11d026715573a610a8370c3c7546c5af8",
    description:
      "Launch page: a ready-to-publish website with a search-friendly page, icons and a small data feed",
    omit: ["docs/demo.gif", "video/shots"],
  },
  portal: {
    repo: "https://github.com/flisk-sh/flisk-template-portal.git",
    ref: "0d57988acca78ff6649d861edcc683ece2afff22",
    description:
      "Developer portal: sign in with GitHub, hand out access keys and see who uses what",
  },
  // Not "stack": that is a command name, and `flisk <template>` is the one-command flow.
  fullstack: {
    repo: "https://github.com/flisk-sh/flisk-stack.git",
    ref: "fff53f3c77d0daea1f34498c70fe48a9e372b682",
    description:
      "Full app to build on: a website, the part behind it, background jobs and a database",
    omit: ["docs/demo.gif", "docs/demo.mp4"],
  },
};

/** The template catalog in registration order: key, repo, description, needs and, for a pinned template, its ref. */
export function listProjectTemplates(): ProjectTemplateEntry[] {
  return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
    key,
    repo: template.repo,
    description: template.description,
    needs: starterNeeds(key),
    ...(template.ref ? { ref: template.ref } : {}),
  }));
}

/**
 * The folder a starter lands in: the requested path, or its default folder. A starter that the
 * CLI writes itself (generated or composed) defaults to its own name; one cloned from a repository
 * defaults to that repository's name. Those six starters all point at the main `flisk-sh/flisk`
 * repository, so its name is not a useful folder: two of them would collide as `flisk/`.
 *
 * Every caller uses this function, so the printed next steps, the JSON result and the folder on
 * disk cannot disagree.
 */
export function templateTargetDir(templateName: string, targetDir?: string): string {
  if (targetDir) return targetDir;
  const template = PROJECT_TEMPLATES[templateName];
  if (template?.generated || template?.composed) return templateName;
  const fromRepo = template?.repo.split("/").pop() ?? templateName;
  return fromRepo.replace(/\.git$/, "");
}

/**
 * Fetches a repository template into `destination` and keeps its source as `upstream`.
 * Unpinned templates need only the latest commit; pinned templates retain the history needed to
 * check out their exact commit. The pinned commit is reached by moving the cloned default branch
 * onto it, not by a detached checkout: a beginner's first commits on a detached HEAD belong to no
 * branch and are lost on the next `git switch` (#4286).
 */
export function templateGitCommands(template: ProjectTemplate, destination: string): string[][] {
  const commands = [
    ["clone", ...(template.ref ? [] : ["--depth", "1"]), template.repo, destination],
  ];
  if (template.ref) {
    commands.push(["-C", destination, "reset", "--hard", "--quiet", template.ref]);
  }
  commands.push(["-C", destination, "remote", "rename", "origin", "upstream"]);
  return commands;
}

/**
 * The template of the one-command flow (`flisk demo`), read from the raw arguments.
 *
 * Only the first argument can name a template. A command that takes a template of its
 * own — `flisk project demo` clones a starter and configures it, `flisk up demo` is not a
 * command at all — is that command, not the one-command flow. Looking further down the
 * arguments hijacked every command that mentioned a template name anywhere.
 */
export function bareTemplateArg(args: string[]): string | undefined {
  const first = args[2];
  if (!first || first.startsWith("-")) return undefined;
  return first in PROJECT_TEMPLATES ? first : undefined;
}

/** Where a bundled example can live: the npm/source package root, the engine bundle next to a compiled binary, an installed dependency. */
export function bundledTemplateRootCandidates(roots: {
  packageRoot: string;
  exeDir: string;
  workingDir: string;
}): string[] {
  return [
    roots.packageRoot,
    join(roots.exeDir, "flisk-cli"),
    join(roots.workingDir, "node_modules", "@flisk-sh", "flisk"),
  ];
}

/**
 * The first candidate that really holds `bundledPath`, or null. A `bun build --compile`
 * binary has no package root (import.meta.url resolves to /), so the engine bundle
 * beside the executable is the one that matches there (#3880).
 */
export function resolveBundledTemplateDir(
  bundledPath: string,
  roots: { packageRoot: string; exeDir: string; workingDir: string },
  exists: (path: string) => boolean = existsSync,
): string | null {
  return (
    bundledTemplateRootCandidates(roots)
      .map((root) => resolve(root, bundledPath))
      .find(exists) ?? null
  );
}
