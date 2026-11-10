// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toComposeProjectName } from "../../utils/compose-project-name.js";
import { nativeContainerName } from "../../utils/native-container.js";
import { readProjectNameOrUndefined } from "../../utils/project-reader.js";

describe("git worktree stack isolation verification (#3406)", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors in tests
      }
    }
    tempDirs.length = 0;
  });

  function createRepoWithWorktree(projectName: string) {
    const baseDir = mkdtempSync(join(tmpdir(), "flisk-worktree-test-"));
    tempDirs.push(baseDir);

    const mainClone = join(baseDir, "main-clone");
    const linkedWorktree = join(baseDir, "linked-worktree");
    mkdirSync(join(mainClone, ".git"), { recursive: true });
    mkdirSync(join(mainClone, ".flisk"), { recursive: true });
    writeFileSync(
      join(mainClone, ".flisk", "project.json"),
      JSON.stringify({ project: { name: projectName, version: "1.0.0" } }),
    );

    // Create linked worktree (.git is a file referencing gitdir in main repo)
    mkdirSync(linkedWorktree, { recursive: true });
    writeFileSync(
      join(linkedWorktree, ".git"),
      `gitdir: ${join(mainClone, ".git", "worktrees", "feature-worktree")}\n`,
    );
    mkdirSync(join(linkedWorktree, ".flisk"), { recursive: true });
    writeFileSync(
      join(linkedWorktree, ".flisk", "project.json"),
      JSON.stringify({ project: { name: projectName, version: "1.0.0" } }),
    );

    return { mainClone, linkedWorktree };
  }

  it("demonstrates that two worktrees of one repo resolve identical project names", () => {
    const { mainClone, linkedWorktree } = createRepoWithWorktree("acme-shop");

    const mainProject = readProjectNameOrUndefined(mainClone);
    const worktreeProject = readProjectNameOrUndefined(linkedWorktree);

    // Both resolve to the same project name because .flisk/project.json is shared
    expect(mainProject).toBe("acme-shop");
    expect(worktreeProject).toBe("acme-shop");
    expect(mainProject).toBe(worktreeProject);
  });

  it("demonstrates container name collision between concurrent worktrees", () => {
    const { mainClone, linkedWorktree } = createRepoWithWorktree("acme-shop");
    const serviceName = "redis";

    const mainProject = readProjectNameOrUndefined(mainClone) ?? "";
    const worktreeProject = readProjectNameOrUndefined(linkedWorktree) ?? "";

    expect(mainProject).not.toBe("");
    expect(worktreeProject).not.toBe("");

    const mainContainer = nativeContainerName(mainProject, serviceName);
    const worktreeContainer = nativeContainerName(worktreeProject, serviceName);

    // Identical container names mean Agent 2's start will run `docker rm -f` on Agent 1's container
    expect(mainContainer).toBe("flisk-acme-shop-redis");
    expect(worktreeContainer).toBe("flisk-acme-shop-redis");
    expect(mainContainer).toBe(worktreeContainer);
  });

  it("demonstrates Docker Compose project prefix collision between worktrees", () => {
    const { mainClone, linkedWorktree } = createRepoWithWorktree("acme-shop");

    const mainProject = readProjectNameOrUndefined(mainClone) ?? "";
    const worktreeProject = readProjectNameOrUndefined(linkedWorktree) ?? "";

    expect(mainProject).not.toBe("");
    expect(worktreeProject).not.toBe("");

    const mainComposePrefix = toComposeProjectName(mainProject);
    const worktreeComposePrefix = toComposeProjectName(worktreeProject);

    // Both map to acme_shop, so docker compose projects and volumes (${prefix}_data) collide
    expect(mainComposePrefix).toBe("acme_shop");
    expect(worktreeComposePrefix).toBe("acme_shop");
    expect(mainComposePrefix).toBe(worktreeComposePrefix);
  });

  it("demonstrates host port collision (EADDRINUSE) when two stacks run on identical ports", async () => {
    // Start a server on an ephemeral port to simulate Agent 1 running
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Unable to obtain server port");
    }
    const busyPort = address.port;

    // Simulate Agent 2 attempting to bind the same port in plain-process mode
    const conflictingServer = createServer();
    const collisionError = await new Promise<Error | null>((resolve) => {
      conflictingServer.on("error", (err) => resolve(err));
      conflictingServer.listen(busyPort, "127.0.0.1", () => {
        conflictingServer.close();
        resolve(null);
      });
    });

    expect(collisionError).not.toBeNull();
    expect((collisionError as NodeJS.ErrnoException).code).toBe("EADDRINUSE");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
