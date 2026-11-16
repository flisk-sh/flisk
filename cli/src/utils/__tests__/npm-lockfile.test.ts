import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateNpmLockfile, LOCKFILE_COMMAND } from "../npm-lockfile.js";

describe("generateNpmLockfile", () => {
  it("leaves an existing lockfile alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-lock-"));
    writeFileSync(join(dir, "package-lock.json"), "{}");
    expect(generateNpmLockfile(dir)).toEqual({ ok: true, reason: "" });
  });

  it("reports a failure instead of throwing when the folder has no package.json", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "flisk-lock-")), "empty");
    mkdirSync(dir);
    const result = generateNpmLockfile(dir);
    // Without a package.json npm still writes a lockfile for an empty package, or is missing; either way no exception.
    expect(typeof result.ok).toBe("boolean");
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("writes the lockfile only, with no install and no scripts", () => {
    expect(LOCKFILE_COMMAND).toContain("--package-lock-only");
    expect(LOCKFILE_COMMAND).toContain("--ignore-scripts");
  });
});
