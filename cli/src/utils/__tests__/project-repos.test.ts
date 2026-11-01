import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FliskError } from "../errors.js";
import {
  checkProjectRepos,
  cloneMissingRepos,
  cloneRepo,
  validateRepoBranch,
  validateRepoDir,
  validateRepoList,
  validateRepoUrl,
} from "../project-repos.js";

/** Stands in for `git clone`: creates the destination directory that is the last argument. */
const createCloneDestination = async (args: string[]): Promise<string> => {
  mkdirSync(args[args.length - 1] as string, { recursive: true });
  return "";
};

describe("project-repos utility", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(realpathSync(tmpdir()), "flisk-repos-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("validateRepoUrl", () => {
    it("accepts valid SSH, HTTPS, file, and local path URLs", () => {
      expect(validateRepoUrl("git@github.com:flisk-sh/flisk.git").valid).toBe(true);
      expect(validateRepoUrl("https://github.com/flisk-sh/flisk.git").valid).toBe(true);
      expect(validateRepoUrl("ssh://git@github.com/flisk-sh/flisk.git").valid).toBe(true);
      expect(validateRepoUrl("file:///tmp/bare-repo.git").valid).toBe(true);
      expect(validateRepoUrl("/local/bare-repo.git").valid).toBe(true);
      expect(validateRepoUrl("./local/bare-repo.git").valid).toBe(true);
    });

    it("rejects empty URL", () => {
      const res = validateRepoUrl("");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("cannot be empty");
    });

    it("rejects URLs starting with hyphen to prevent option injection", () => {
      expect(validateRepoUrl("--upload-pack=evil").valid).toBe(false);
      expect(validateRepoUrl("-oProxyCommand=evil").valid).toBe(false);
    });

    it("rejects URLs with dangerous characters or shell metacharacters", () => {
      expect(validateRepoUrl("https://github.com/repo;rm -rf /").valid).toBe(false);
      expect(validateRepoUrl("https://github.com/repo\nevil").valid).toBe(false);
      expect(validateRepoUrl("https://github.com/repo`evil`").valid).toBe(false);
      expect(validateRepoUrl("https://github.com/repo$evil").valid).toBe(false);
      expect(validateRepoUrl("https://github.com/repo|evil").valid).toBe(false);
      expect(validateRepoUrl("https://github.com/repo&evil").valid).toBe(false);
    });
  });

  describe("validateRepoBranch", () => {
    it("accepts valid branch names", () => {
      expect(validateRepoBranch("main").valid).toBe(true);
      expect(validateRepoBranch("feature/auth-v2").valid).toBe(true);
      expect(validateRepoBranch("release-1.0.0").valid).toBe(true);
      expect(validateRepoBranch(undefined).valid).toBe(true);
    });

    it("rejects branches starting with dash", () => {
      const res = validateRepoBranch("--upload-pack=evil");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("cannot start with a dash");
    });

    it("rejects dangerous or control characters in branch", () => {
      expect(validateRepoBranch("branch;rm -rf /").valid).toBe(false);
      expect(validateRepoBranch("branch`evil`").valid).toBe(false);
      expect(validateRepoBranch("branch$evil").valid).toBe(false);
    });
  });

  describe("validateRepoDir", () => {
    it("accepts safe relative project paths", () => {
      const res = validateRepoDir("services/shop/orders-api", tempDir);
      expect(res.valid).toBe(true);
      expect(res.targetPath).toBe(resolve(tempDir, "services/shop/orders-api"));
    });

    it("rejects empty directory", () => {
      expect(validateRepoDir("", tempDir).valid).toBe(false);
      expect(validateRepoDir("   ", tempDir).valid).toBe(false);
    });

    it("rejects absolute paths", () => {
      const res = validateRepoDir("/etc/passwd", tempDir);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Absolute destination path rejected");
    });

    it("rejects directory traversal", () => {
      expect(validateRepoDir("../outside", tempDir).valid).toBe(false);
      expect(validateRepoDir("services/../../outside", tempDir).valid).toBe(false);
      expect(validateRepoDir("services/../..", tempDir).valid).toBe(false);
    });

    it("rejects reserved directories", () => {
      expect(validateRepoDir(".git", tempDir).valid).toBe(false);
      expect(validateRepoDir(".flisk", tempDir).valid).toBe(false);
      expect(validateRepoDir("node_modules", tempDir).valid).toBe(false);
      expect(validateRepoDir("services/.git/child", tempDir).valid).toBe(false);
      expect(validateRepoDir("services/node_modules/child", tempDir).valid).toBe(false);
    });

    it("rejects symlinks that escape the project root", () => {
      const outsideDir = mkdtempSync(join(realpathSync(tmpdir()), "flisk-outside-"));
      const symlinkPath = join(tempDir, "escaped-link");
      symlinkSync(outsideDir, symlinkPath);

      const res = validateRepoDir("escaped-link/service", tempDir);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("escaping project root");

      rmSync(outsideDir, { recursive: true, force: true });
    });
  });

  describe("validateRepoList", () => {
    it("passes with valid distinct repos", () => {
      const res = validateRepoList(
        [
          { url: "https://github.com/acme/orders.git", dir: "services/orders" },
          { url: "https://github.com/acme/billing.git", dir: "services/billing" },
        ],
        tempDir,
      );
      expect(res.valid).toBe(true);
    });

    it("rejects duplicate destination directories", () => {
      const res = validateRepoList(
        [
          { url: "https://github.com/acme/orders.git", dir: "services/orders" },
          { url: "https://github.com/acme/orders-fork.git", dir: "services/orders" },
        ],
        tempDir,
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Duplicate destination directory");
    });

    it("rejects nested conflicting directories", () => {
      const res = validateRepoList(
        [
          { url: "https://github.com/acme/shop.git", dir: "services/shop" },
          { url: "https://github.com/acme/orders.git", dir: "services/shop/orders" },
        ],
        tempDir,
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Conflicting nested target directories");
    });
  });

  describe("cloneRepo and cloneMissingRepos with mock runner", () => {
    it("skips cloning if target directory already exists", async () => {
      const targetDir = join(tempDir, "services/orders");
      mkdirSync(targetDir, { recursive: true });

      const runner = vi.fn();
      const res = await cloneRepo(
        { url: "https://github.com/acme/orders.git", dir: "services/orders" },
        tempDir,
        runner,
      );

      expect(res.cloned).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toContain("already exists");
      expect(runner).not.toHaveBeenCalled();
    });

    it("invokes runner with structured git arguments and branch when missing", async () => {
      const runner = vi.fn().mockImplementation(createCloneDestination);
      const res = await cloneRepo(
        { url: "https://github.com/acme/orders.git", dir: "services/orders", branch: "develop" },
        tempDir,
        runner,
      );

      expect(res.cloned).toBe(true);
      expect(res.skipped).toBe(false);
      expect(runner).toHaveBeenCalledTimes(1);
      const [args] = runner.mock.calls[0];
      expect(args.slice(0, 6)).toEqual([
        "clone",
        "--quiet",
        "--branch",
        "develop",
        "--",
        "https://github.com/acme/orders.git",
      ]);
      expect(args[6]).toMatch(/services[\\/]orders\.flisk-clone-/);
      expect(runner.mock.calls[0]?.[1]).toEqual({ cwd: tempDir });
    });

    it("cleans up the temporary clone on failure and throws FliskError", async () => {
      const targetDir = join(tempDir, "services/failed-repo");
      const runner = vi.fn().mockImplementation(async (args: string[]) => {
        const tempPath = args[args.length - 1] as string;
        mkdirSync(tempPath, { recursive: true });
        writeFileSync(join(tempPath, "partial.tmp"), "corrupt");
        throw new Error("fatal: remote branch not found");
      });

      await expect(
        cloneRepo(
          { url: "https://github.com/acme/failed.git", dir: "services/failed-repo" },
          tempDir,
          runner,
        ),
      ).rejects.toThrow(FliskError);

      expect(existsSync(targetDir)).toBe(false);
      expect(readdirSync(join(tempDir, "services"))).toEqual([]);
    });

    it("throws FliskError when the destination exists as a file", async () => {
      const targetFile = join(tempDir, "services/file-repo");
      mkdirSync(join(tempDir, "services"), { recursive: true });
      writeFileSync(targetFile, "not a folder");
      const runner = vi.fn();

      await expect(
        cloneRepo(
          { url: "https://github.com/acme/file.git", dir: "services/file-repo" },
          tempDir,
          runner,
        ),
      ).rejects.toThrow(/exists and is not a directory/);
      expect(runner).not.toHaveBeenCalled();
    });

    it("redacts credentials from clone failure messages", async () => {
      const runner = vi
        .fn()
        .mockRejectedValue(new Error("fatal: could not read https://user:secret@host/acme/x.git"));

      const error = await cloneRepo(
        { url: "https://user:secret@github.com/acme/x.git", dir: "services/x" },
        tempDir,
        runner,
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FliskError);
      expect((error as FliskError).message).not.toContain("secret");
      expect((error as FliskError).message).toContain("***@github.com");
    });

    it("clones multiple missing repos via cloneMissingRepos", async () => {
      const runner = vi.fn().mockImplementation(createCloneDestination);
      const results = await cloneMissingRepos(
        tempDir,
        [
          { url: "https://github.com/acme/orders.git", dir: "services/orders" },
          { url: "https://github.com/acme/billing.git", dir: "services/billing" },
        ],
        runner,
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.cloned).toBe(true);
      expect(results[1]?.cloned).toBe(true);
      expect(runner).toHaveBeenCalledTimes(2);
    });
  });

  describe("checkProjectRepos (doctor integration)", () => {
    it("returns skipped when no repos configured", async () => {
      const res = await checkProjectRepos(tempDir, []);
      expect(res.didPass).toBe(true);
      expect(res.isSkipped).toBe(true);
    });

    it("reports failure when a declared repository is missing", async () => {
      const res = await checkProjectRepos(tempDir, [
        { url: "https://github.com/acme/missing.git", dir: "services/missing" },
      ]);
      expect(res.didPass).toBe(false);
      expect(res.message).toContain("1 service repository missing");
      expect(res.fix).toContain("flisk repos clone");
    });

    it("reports failure when target directory is not a git repository", async () => {
      const targetDir = join(tempDir, "services/not-git");
      mkdirSync(targetDir, { recursive: true });

      const runner = vi.fn().mockRejectedValue(new Error("not a git repository"));
      const res = await checkProjectRepos(
        tempDir,
        [{ url: "https://github.com/acme/repo.git", dir: "services/not-git" }],
        runner,
      );

      expect(res.didPass).toBe(false);
      expect(res.message).toContain("not a Git repository");
    });

    it("reports warning when on different branch than configured", async () => {
      const targetDir = join(tempDir, "services/branch-repo");
      mkdirSync(targetDir, { recursive: true });

      const runner = vi.fn().mockImplementation(async (args: string[]) => {
        if (args.includes("--show-toplevel")) return `${targetDir}\n`;
        if (args.includes("HEAD")) return "feature-x\n";
        if (args.includes("--porcelain")) return "";
        return "";
      });

      const res = await checkProjectRepos(
        tempDir,
        [{ url: "https://github.com/acme/repo.git", dir: "services/branch-repo", branch: "main" }],
        runner,
      );

      expect(res.didPass).toBe(false);
      expect(res.isWarning).toBe(true);
      expect(res.message).toContain('is on branch "feature-x", expected "main"');
    });

    it("reports warning when there are uncommitted changes", async () => {
      const targetDir = join(tempDir, "services/dirty-repo");
      mkdirSync(targetDir, { recursive: true });

      const runner = vi.fn().mockImplementation(async (args: string[]) => {
        if (args.includes("--show-toplevel")) return `${targetDir}\n`;
        if (args.includes("HEAD")) return "main\n";
        if (args.includes("--porcelain")) return " M file.ts\n";
        return "";
      });

      const res = await checkProjectRepos(
        tempDir,
        [{ url: "https://github.com/acme/repo.git", dir: "services/dirty-repo", branch: "main" }],
        runner,
      );

      expect(res.didPass).toBe(false);
      expect(res.isWarning).toBe(true);
      expect(res.message).toContain("has local uncommitted changes");
    });

    it("passes when repository is clean and on configured branch", async () => {
      const targetDir = join(tempDir, "services/clean-repo");
      mkdirSync(targetDir, { recursive: true });

      const runner = vi.fn().mockImplementation(async (args: string[]) => {
        if (args.includes("--show-toplevel")) return `${targetDir}\n`;
        if (args.includes("HEAD")) return "main\n";
        if (args.includes("--porcelain")) return "";
        return "";
      });

      const res = await checkProjectRepos(
        tempDir,
        [{ url: "https://github.com/acme/repo.git", dir: "services/clean-repo", branch: "main" }],
        runner,
      );

      expect(res.didPass).toBe(true);
      expect(res.message).toContain("clean");
    });
  });

  describe("real offline bare repository cloning", () => {
    it("clones a real bare Git repository fixture into target destination", async () => {
      const bareRepoDir = join(tempDir, "bare-source.git");
      const workDir = join(tempDir, "init-source");
      const projectDir = join(tempDir, "hub-project");

      // 1. Create a bare git repo fixture
      execFileSync("git", ["init", "--bare", bareRepoDir]);

      // 2. Populate it with an initial commit
      execFileSync("git", ["clone", bareRepoDir, workDir]);
      writeFileSync(join(workDir, "service.json"), JSON.stringify({ appName: "orders-api" }));
      execFileSync("git", ["-C", workDir, "config", "user.name", "Test User"]);
      execFileSync("git", ["-C", workDir, "config", "user.email", "test@example.com"]);
      execFileSync("git", ["-C", workDir, "add", "service.json"]);
      execFileSync("git", ["-C", workDir, "commit", "-m", "init orders"]);
      execFileSync("git", ["-C", workDir, "push", "origin", "HEAD:main"]);

      // 3. Setup project root
      mkdirSync(join(projectDir, ".flisk"), { recursive: true });
      writeFileSync(
        join(projectDir, ".flisk", "project.json"),
        JSON.stringify({
          version: "1.0",
          project: { name: "hub", version: "0.1.0" },
          phases: {
            pre_alpha: { enabledStacks: ["shop"] },
            alpha: { enabledStacks: ["shop"] },
            beta: { enabledStacks: ["shop"] },
            out_of_scope: { enabledStacks: [] },
          },
          optional_infra: {
            monitoring: false,
            elk: false,
            debezium: false,
            golden_image: false,
            verdaccio: false,
          },
          discovery: { paths: ["services/*/*"] },
          repos: [{ url: bareRepoDir, dir: "services/orders-api", branch: "main" }],
        }),
      );

      // 4. Run cloneMissingRepos
      const results = await cloneMissingRepos(projectDir);
      expect(results).toHaveLength(1);
      expect(results[0]?.cloned).toBe(true);
      expect(results[0]?.skipped).toBe(false);

      const clonedServiceJson = join(projectDir, "services/orders-api/service.json");
      expect(existsSync(clonedServiceJson)).toBe(true);

      // 5. Run a second time to verify idempotency
      const secondRun = await cloneMissingRepos(projectDir);
      expect(secondRun).toHaveLength(1);
      expect(secondRun[0]?.cloned).toBe(false);
      expect(secondRun[0]?.skipped).toBe(true);
    });
  });
});
