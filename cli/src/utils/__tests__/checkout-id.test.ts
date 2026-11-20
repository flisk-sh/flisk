// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHECKOUT_ID_ENV,
  CHECKOUT_NAME_ENV,
  canonicalCheckoutPath,
  checkoutEnvVars,
  exportCheckoutEnv,
  getCheckoutId,
  getCheckoutIdentity,
  getCheckoutName,
  sanitizeCheckoutName,
} from "../checkout-id.js";

const tempDirs: string[] = [];

function makeTempDir(prefix = "flisk-checkout-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("checkout-id", () => {
  describe("getCheckoutId", () => {
    it("generates a new 8-hex id and persists it with the canonical path", () => {
      const root = makeTempDir();
      const id = getCheckoutId(root);

      expect(id).toMatch(/^[0-9a-f]{8}$/);
      const idFile = join(root, ".flisk", ".project-id");
      expect(existsSync(idFile)).toBe(true);

      const stored = JSON.parse(readFileSync(idFile, "utf-8")) as { id: string; path: string };
      expect(stored.id).toBe(id);
      expect(stored.path).toBe(canonicalCheckoutPath(root));
    });

    it("returns the same id across repeated calls for the same checkout", () => {
      const root = makeTempDir();
      const first = getCheckoutId(root);
      const second = getCheckoutId(root);
      const third = getCheckoutId(root);

      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it("returns the same id when accessed through a symlink alias", () => {
      const parent = makeTempDir();
      const realDir = join(parent, "real-checkout");
      const linkDir = join(parent, "link-checkout");
      mkdirSync(realDir, { recursive: true });
      symlinkSync(realDir, linkDir, "dir");

      const first = getCheckoutId(realDir);
      const viaLink = getCheckoutId(linkDir);

      expect(viaLink).toBe(first);
    });

    it("generates a new id when a checkout folder is copied to another path", () => {
      const parent = makeTempDir();
      const original = join(parent, "repo-a");
      const copy = join(parent, "repo-b");
      mkdirSync(original, { recursive: true });

      const originalId = getCheckoutId(original);
      cpSync(original, copy, { recursive: true });

      const copyId = getCheckoutId(copy);
      expect(copyId).toMatch(/^[0-9a-f]{8}$/);
      expect(copyId).not.toBe(originalId);
      // Original checkout keeps its id unchanged.
      expect(getCheckoutId(original)).toBe(originalId);
      // Copy now stores its own canonical path and remains stable.
      expect(getCheckoutId(copy)).toBe(copyId);
      const storedCopy = JSON.parse(readFileSync(join(copy, ".flisk", ".project-id"), "utf-8")) as {
        id: string;
        path: string;
      };
      expect(storedCopy).toEqual({ id: copyId, path: canonicalCheckoutPath(copy) });
    });

    it("generates a new id when a checkout folder is moved to a new path", () => {
      const parent = makeTempDir();
      const before = join(parent, "before-move");
      const after = join(parent, "after-move");
      mkdirSync(before, { recursive: true });

      const beforeId = getCheckoutId(before);
      renameSync(before, after);

      const afterId = getCheckoutId(after);
      expect(afterId).toMatch(/^[0-9a-f]{8}$/);
      expect(afterId).not.toBe(beforeId);
      expect(getCheckoutId(after)).toBe(afterId);
    });

    it("replaces a legacy plain-UUID .project-id with a path-bound 8-hex id", () => {
      const root = makeTempDir();
      mkdirSync(join(root, ".flisk"), { recursive: true });
      writeFileSync(
        join(root, ".flisk", ".project-id"),
        "550e8400-e29b-41d4-a716-446655440000\n",
        "utf-8",
      );

      const id = getCheckoutId(root);
      expect(id).toMatch(/^[0-9a-f]{8}$/);
      const stored = JSON.parse(readFileSync(join(root, ".flisk", ".project-id"), "utf-8")) as {
        id: string;
        path: string;
      };
      expect(stored).toEqual({ id, path: canonicalCheckoutPath(root) });
    });

    it("recovers cleanly from a corrupt .project-id file", () => {
      const root = makeTempDir();
      mkdirSync(join(root, ".flisk"), { recursive: true });
      writeFileSync(join(root, ".flisk", ".project-id"), "{not-valid-json", "utf-8");

      const id = getCheckoutId(root);
      expect(id).toMatch(/^[0-9a-f]{8}$/);
      expect(getCheckoutId(root)).toBe(id);
    });

    it("does not write .flisk/.project-id when persist is false", () => {
      const root = makeTempDir();
      const id = getCheckoutId(root, { persist: false });

      expect(id).toMatch(/^[0-9a-f]{8}$/);
      expect(existsSync(join(root, ".flisk", ".project-id"))).toBe(false);
      expect(getCheckoutId(root, { persist: false })).toBe(id);
    });
  });

  describe("sanitizeCheckoutName and getCheckoutName", () => {
    it.each([
      ["my-app", "my-app"],
      ["MyApp", "myapp"],
      ["My_Feature.Branch 2", "my-feature-branch-2"],
      ["---leading_and_trailing---", "leading-and-trailing"],
      ["app@v1.2+hotfix!", "app-v1-2-hotfix"],
      ["UPPER_CASE_123", "upper-case-123"],
      ["...", "checkout"],
      ["___", "checkout"],
      ["", "checkout"],
    ])("sanitizes %j to %j", (input, expected) => {
      expect(sanitizeCheckoutName(input)).toBe(expected);
      expect(sanitizeCheckoutName(input)).toMatch(/^[a-z0-9-]+$/);
    });

    it("derives the sanitized folder name from projectRoot", () => {
      const parent = makeTempDir();
      const checkoutDir = join(parent, "Worktree_Feature.01");
      mkdirSync(checkoutDir, { recursive: true });

      expect(getCheckoutName(checkoutDir)).toBe("worktree-feature-01");
    });
  });

  describe("getCheckoutIdentity, checkoutEnvVars, and exportCheckoutEnv", () => {
    it("returns matching identity and exports FLISK_CHECKOUT_ID and FLISK_CHECKOUT_NAME", () => {
      const parent = makeTempDir();
      const checkoutDir = join(parent, "Payments_WT2");
      mkdirSync(checkoutDir, { recursive: true });

      const identity = getCheckoutIdentity(checkoutDir);
      expect(identity.id).toMatch(/^[0-9a-f]{8}$/);
      expect(identity.name).toBe("payments-wt2");

      expect(checkoutEnvVars(checkoutDir)).toEqual({
        [CHECKOUT_ID_ENV]: identity.id,
        [CHECKOUT_NAME_ENV]: "payments-wt2",
      });

      const targetEnv: NodeJS.ProcessEnv = {};
      const exported = exportCheckoutEnv(checkoutDir, targetEnv);
      expect(exported).toEqual(identity);
      expect(targetEnv.FLISK_CHECKOUT_ID).toBe(identity.id);
      expect(targetEnv.FLISK_CHECKOUT_NAME).toBe("payments-wt2");
    });
  });
});
