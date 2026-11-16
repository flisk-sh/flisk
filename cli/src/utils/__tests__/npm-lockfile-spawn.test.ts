import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnSync = vi.fn();
vi.mock("node:child_process", () => ({ spawnSync }));

const { generateNpmLockfile } = await import("../npm-lockfile.js");

const dir = () => mkdtempSync(join(tmpdir(), "flisk-lock-"));

describe("generateNpmLockfile with npm mocked", () => {
  beforeEach(() => spawnSync.mockReset());

  it("says npm is not installed on ENOENT", () => {
    spawnSync.mockReturnValue({ error: Object.assign(new Error("x"), { code: "ENOENT" }) });
    expect(generateNpmLockfile(dir())).toEqual({ ok: false, reason: "npm is not installed" });
  });

  it("passes on another spawn error message", () => {
    spawnSync.mockReturnValue({ error: new Error("timed out") });
    expect(generateNpmLockfile(dir())).toEqual({ ok: false, reason: "timed out" });
  });

  it("reports the last lines of npm's output when it fails", () => {
    spawnSync.mockReturnValue({ status: 1, stdout: "a\nb\n", stderr: "c\nnpm ERR! offline\n" });
    expect(generateNpmLockfile(dir()).reason).toBe("c npm ERR! offline");
  });

  it("falls back to the exit code when npm printed nothing", () => {
    spawnSync.mockReturnValue({ status: 3, stdout: "", stderr: "" });
    expect(generateNpmLockfile(dir()).reason).toBe("npm exited with 3");
  });

  it("fails when npm succeeds but writes no lockfile", () => {
    spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
    expect(generateNpmLockfile(dir())).toEqual({
      ok: false,
      reason: "npm wrote no package-lock.json",
    });
  });

  it("succeeds when npm writes the lockfile", () => {
    const d = dir();
    spawnSync.mockImplementation(() => {
      writeFileSync(join(d, "package-lock.json"), "{}");
      return { status: 0, stdout: "", stderr: "" };
    });
    expect(generateNpmLockfile(d)).toEqual({ ok: true, reason: "" });
  });
});
