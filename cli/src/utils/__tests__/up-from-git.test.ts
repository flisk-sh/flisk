import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FliskError } from "../errors.js";
import { cloneForUp, isGitRepoArg, repoDirName } from "../up-from-git.js";

describe("isGitRepoArg", () => {
  it("tells a repository URL from a stack name", () => {
    for (const url of [
      "https://github.com/flisk-sh/demo",
      "https://github.com/flisk-sh/demo.git",
      "ssh://git@github.com/flisk-sh/demo.git",
      "git@github.com:flisk-sh/demo.git",
      "file:///tmp/demo",
    ]) {
      expect(isGitRepoArg(url)).toBe(true);
    }
    for (const name of [undefined, "", "web", "agent-stack", "my.stack"]) {
      expect(isGitRepoArg(name)).toBe(false);
    }
  });
});

describe("repoDirName", () => {
  it("names the folder the way git clone does", () => {
    expect(repoDirName("https://github.com/flisk-sh/demo.git")).toBe("demo");
    expect(repoDirName("https://github.com/flisk-sh/demo/")).toBe("demo");
    expect(repoDirName("git@github.com:flisk-sh/demo.git")).toBe("demo");
    expect(repoDirName("https://github.com/flisk-sh/demo?tab=readme")).toBe("demo");
  });

  it("refuses a URL with no usable name", () => {
    expect(() => repoDirName("https://github.com/..")).toThrow(FliskError);
  });
});

describe("cloneForUp", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "flisk-up-git-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("shallow-clones into ./<repo name> and returns that folder", async () => {
    const git = vi.fn(async (args: string[]) => {
      mkdirSync(args[args.length - 1] as string, { recursive: true });
      return "";
    });
    const dir = await cloneForUp("https://github.com/flisk-sh/demo.git", { cwd, git });
    expect(dir).toBe(join(cwd, "demo"));
    expect(git).toHaveBeenCalledWith([
      "clone",
      "--depth",
      "1",
      "--",
      "https://github.com/flisk-sh/demo.git",
      join(cwd, "demo"),
    ]);
  });

  it("reuses an existing checkout without cloning", async () => {
    mkdirSync(join(cwd, "demo", ".git"), { recursive: true });
    const git = vi.fn(async () => "");
    expect(await cloneForUp("https://github.com/flisk-sh/demo", { cwd, git })).toBe(
      join(cwd, "demo"),
    );
    expect(git).not.toHaveBeenCalled();
  });

  it("refuses a non-empty folder that is not a checkout", async () => {
    mkdirSync(join(cwd, "demo"));
    writeFileSync(join(cwd, "demo", "notes.txt"), "mine");
    await expect(
      cloneForUp("https://github.com/flisk-sh/demo", { cwd, git: vi.fn(async () => "") }),
    ).rejects.toThrow(/not a git checkout/);
  });

  it("rejects an unsafe URL before running git", async () => {
    const git = vi.fn(async () => "");
    await expect(cloneForUp("https://x.com/a;rm -rf", { cwd, git })).rejects.toThrow(FliskError);
    expect(git).not.toHaveBeenCalled();
  });

  it("reports a failed clone without leaking a token", async () => {
    const git = vi.fn(async () => {
      throw Object.assign(new Error("x"), {
        stderr: "fatal: could not read https://tok123@github.com/flisk-sh/demo",
      });
    });
    const error = await cloneForUp("https://tok123@github.com/flisk-sh/demo", { cwd, git }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(FliskError);
    expect(error.message).not.toContain("tok123");
  });
});
