// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/index.js";
import { FliskError } from "../errors.js";
import { ResourceFilePlan } from "../resource-plan.js";

describe("resource plan validation", () => {
  it.each(["service.json", "./service.json", "nested/../service.json", "SERVICE.JSON"])(
    "rejects duplicate text and task targets (%s) before any writes",
    (filename) => {
      const root = createTempDir();
      const base = join(root, "new");
      const plan = new ResourceFilePlan();
      plan.directory(base);
      plan.text(join(base, "service.json"), '{"appName":"api"}');
      plan.files(base, [
        { filename, type: "text", content: "FROM scratch", description: "Dockerfile", emoji: "" },
      ]);
      expect(() => plan.preview(root)).toThrow(/multiple writes/);
      expect(() => plan.write()).toThrow(FliskError);
      expect(readdirSync(root)).toEqual([]);
    },
  );

  it.each([true, false])(
    "rejects staged files used as directories (explicit directory: %s)",
    (explicitDirectory) => {
      const root = createTempDir();
      const base = join(root, "new");
      const plan = new ResourceFilePlan();
      plan.directory(base);
      plan.text(join(base, "manifest"), "keep");
      if (explicitDirectory) plan.directory(join(base, "manifest", "nested"));
      else plan.text(join(base, "manifest", "nested", "file"), "conflict");
      expect(() => plan.preview(root)).toThrow(/both a file and a directory/);
      expect(() => plan.write()).toThrow(FliskError);
      expect(readdirSync(root)).toEqual([]);
    },
  );

  it("rejects an existing directory used as a file before creating earlier entries", () => {
    const root = createTempDir();
    mkdirSync(join(root, "existing"));
    const plan = new ResourceFilePlan();
    plan.directory(join(root, "new"));
    plan.text(join(root, "new", "file"), "would be a partial write");
    plan.text(join(root, "existing"), "not a file");
    expect(() => plan.preview(root)).toThrow(/is a directory/);
    expect(() => plan.write()).toThrow(FliskError);
    expect(readdirSync(root)).toEqual(["existing"]);
  });

  it("rechecks ancestors before writing even after a successful preview", () => {
    const root = createTempDir();
    const plan = new ResourceFilePlan();
    plan.directory(join(root, "first"));
    plan.text(join(root, "first", "file"), "not written");
    plan.directory(join(root, "blocked", "nested"));
    expect(() => plan.preview(root)).not.toThrow();
    writeFileSync(join(root, "blocked"), "preserve me");
    expect(() => plan.write()).toThrow(/not a directory/);
    expect(existsSync(join(root, "first"))).toBe(false);
    expect(readFileSync(join(root, "blocked"), "utf8")).toBe("preserve me");
  });

  it("allows repeated directory operations and keeps valid updates working", () => {
    const root = createTempDir();
    writeFileSync(join(root, "existing"), "old");
    const plan = new ResourceFilePlan();
    plan.directory(join(root, "new"));
    plan.directory(join(root, "new"));
    plan.text(join(root, "existing"), "updated");
    plan.files(
      join(root, "new"),
      [
        {
          filename: "nested/file",
          type: "text",
          content: "created",
          description: "File",
          emoji: "",
        },
      ],
      { exclusive: true },
    );
    expect(plan.preview(root)).toEqual({
      directories: ["new"],
      files: [
        { path: "existing", action: "update" },
        { path: "new/nested/file", action: "create" },
      ],
    });
    plan.write();
    expect(readFileSync(join(root, "existing"), "utf8")).toBe("updated");
    expect(readFileSync(join(root, "new/nested/file"), "utf8")).toBe("created");
  });
});
