// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import { getContainerRuntimeStatus } from "../docker.js";
import {
  errorFactories,
  getErrorMessage,
  handleTiltFailure,
  logVerbose,
  ProcessExitError,
  requireProjectRoot,
  runCommand,
  showError,
  showErrorAndExit,
  TdkError,
  withTiltCheck,
} from "../errors.js";
import { toMachineError } from "../machine-output.js";
import { findProjectRoot } from "../paths.js";
import { isTiltAvailable } from "../tilt.js";

vi.mock("../docker.js", () => ({ getContainerRuntimeStatus: vi.fn() }));
vi.mock("../tilt.js", () => ({ isTiltAvailable: vi.fn() }));
vi.mock("../paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../paths.js")>()),
  findProjectRoot: vi.fn(),
}));

/** Make process.exit throw so code after it does not run, and record the exit code. */
function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
}

function errorOutput(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
}

describe("not-found error suggestions", () => {
  it("suggests a close stack name while retaining existing guidance", () => {
    const error = errorFactories.stackNotFound("shp", ["shop", "api"]);

    expect(error.message).toBe('Stack "shp" not found');
    expect(error.suggestions).toEqual([
      'Did you mean "shop"?',
      "Run `flisk stacks` to see available stacks",
      "Run `flisk stack` to assign resources to a stack",
    ]);
  });

  it("suggests a close resource name while retaining existing guidance", () => {
    const error = errorFactories.resourceNotFound("aip", ["api", "web"]);

    expect(error.message).toBe('Resource "aip" not found');
    expect(error.suggestions).toEqual([
      'Did you mean "api"?',
      "Run `flisk resources` to list all resources",
      "Check the resource name spelling",
    ]);
  });

  it("keeps the current suggestions when no candidate is close", () => {
    const error = errorFactories.stackNotFound("missing", ["api", "web"]);

    expect(error.suggestions).toEqual([
      "Run `flisk stacks` to see available stacks",
      "Run `flisk stack` to assign resources to a stack",
    ]);
  });

  it("uses the same suggestion format for unknown services", () => {
    const error = errorFactories.unknownServices(["widgt"], ["widget"]);

    expect(error.message).toBe("Unknown service widgt. Valid names: widget");
    expect(error.exitCode).toBe(2);
    expect(error.suggestions).toEqual(['Did you mean "widget"?']);
  });

  it("pairs each suggestion with its unknown service", () => {
    const error = errorFactories.unknownServices(["widgt", "widge"], ["widget"]);

    expect(error.suggestions).toEqual([
      'Did you mean "widget" for "widgt"?',
      'Did you mean "widget" for "widge"?',
    ]);
  });
  it("preserves usage exit codes in machine-readable errors", () => {
    const error = errorFactories.unknownServices(["widgt"], ["widget"]);

    expect(toMachineError(error).exitCode).toBe(2);
  });

  it("preserves suggestions in machine-readable errors", () => {
    const error = errorFactories.stackNotFound("shp", ["shop"]);

    expect(toMachineError(error).error).toMatchObject({
      code: "COMMAND_FAILED",
      message: 'Stack "shp" not found',
      suggestions: expect.arrayContaining(['Did you mean "shop"?']),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats showError, showErrorAndExit, and TdkError through the unified prefix", () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      lines.push(args.map(String).join(" "));
    });
    const { expectExit } = captureExit();

    showError("First failure", "extra context", ["Try again"]);
    expect(lines[0]).toContain("❌ First failure");
    expect(lines[1]).toContain("extra context");
    expect(lines.join("\n")).toContain("💡 Suggestions:");
    expect(lines.join("\n")).toContain("→ Try again");

    lines.length = 0;
    expect(() => showErrorAndExit("Fatal failure", 2, ["Check flags"])).toThrow("process.exit");
    expect(lines[0]).toContain("❌ Fatal failure");
    expect(lines.join("\n")).toContain("→ Check flags");
    expectExit(2);

    lines.length = 0;
    const tdkErr = new TdkError("Domain failure", ["Run flisk doctor"], 1);
    expect(() => tdkErr.exit()).toThrow("process.exit");
    expect(lines[0]).toContain("❌ Domain failure");
    expect(lines.join("\n")).toContain("→ Run flisk doctor");
  });

  it("routes error diagnostics exclusively to stderr and keeps stdout clean for piping", () => {
    const stderr: string[] = [];
    const stdout: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      stderr.push(args.map(String).join(" "));
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      stdout.push(args.map(String).join(" "));
    });

    showError("Pipeline broke", "Check pipe destination", ["Verify shell pipeline"]);

    expect(stdout).toHaveLength(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(stderr.filter((line) => line.includes("❌"))).toHaveLength(1);
    expect(stderr[0]).toContain("❌ Pipeline broke");
    expect(stderr.join("\n")).toContain("Check pipe destination");
  });

  it("emits multiline diagnostics with exactly one error symbol", () => {
    const stderr: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      stderr.push(args.map(String).join(" "));
    });

    showError("Version too old\nFix: run flisk upgrade");

    const prefixes = stderr.flatMap((line) => line.match(/❌/g) ?? []);
    expect(prefixes).toHaveLength(1);
    expect(stderr.join("\n")).toContain("Version too old");
    expect(stderr.join("\n")).toContain("Fix: run flisk upgrade");
  });
});

describe("getErrorMessage and logVerbose", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TDK_VERBOSE;
  });

  it("returns the message of an Error and stringifies anything else", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("plain")).toBe("plain");
    expect(getErrorMessage(42)).toBe("42");
  });

  it("logs nothing unless TDK_VERBOSE is set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logVerbose("checking runtime");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs the message when TDK_VERBOSE is set", () => {
    process.env.TDK_VERBOSE = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logVerbose("checking runtime");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("checking runtime");
  });

  it("appends the error message when an error is given", () => {
    process.env.TDK_VERBOSE = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logVerbose("probe failed", new Error("ENOENT"));
    expect(String(warn.mock.calls[0][0])).toContain("probe failed: ENOENT");
  });
});

describe("TdkError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to no suggestions and exit code 1", () => {
    const error = new TdkError("bad input");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TdkError");
    expect(error.message).toBe("bad input");
    expect(error.suggestions).toEqual([]);
    expect(error.exitCode).toBe(1);
  });

  it("keeps the given suggestions and exit code", () => {
    const error = new TdkError("bad input", ["try again"], 3);

    expect(error.suggestions).toEqual(["try again"]);
    expect(error.exitCode).toBe(3);
  });

  it("display prints the message and each suggestion without exiting", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    new TdkError("Thing broke", ["Fix A", "Fix B"]).display();

    const output = errorOutput(err);
    expect(output).toContain("❌ Thing broke");
    expect(output).toContain("Suggestions:");
    expect(output).toContain("→ Fix A");
    expect(output).toContain("→ Fix B");
    expect(exit).not.toHaveBeenCalled();
  });

  it("display omits the suggestions header when there are none", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    new TdkError("Thing broke").display();

    const output = errorOutput(err);
    expect(output).toContain("❌ Thing broke");
    expect(output).not.toContain("Suggestions");
  });

  it("exit displays the error then exits with its exit code", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    expect(() => new TdkError("Thing broke", ["Fix A"], 4).exit()).toThrow("process.exit(4)");

    expect(errorOutput(err)).toContain("→ Fix A");
    expect(exit).toHaveBeenCalledWith(4);
  });
});

describe("runCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the action result when it succeeds", async () => {
    await expect(runCommand(async () => "ok")).resolves.toBe("ok");
  });

  it("exits with the TdkError's exit code and shows its suggestions", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    await expect(
      runCommand(async () => {
        throw errorFactories.unknownServices(["widgt"], ["widget"]);
      }),
    ).rejects.toThrow("process.exit(2)");

    expect(errorOutput(err)).toContain("Unknown service widgt");
    expect(errorOutput(err)).toContain('Did you mean "widget"?');
    expect(exit).toHaveBeenCalledWith(2);
  });

  it("prints a generic error and exits 1 for a plain Error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    await expect(
      runCommand(async () => {
        throw new Error("disk full");
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("❌ disk full");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("handles an ordinary Error with the process.exit message as a normal failure", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    await expect(
      runCommand(async () => {
        throw new Error("process.exit");
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("stringifies non-Error rejections", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();

    await expect(
      runCommand(async () => {
        throw "string failure";
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("❌ string failure");
  });

  it("prints the stack trace for an Error when verbose", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();
    const failure = new Error("deep failure");

    await expect(
      runCommand(
        async () => {
          throw failure;
        },
        { verbose: true },
      ),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain(failure.stack ?? "");
  });

  it("does not print a stack trace when not verbose", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();

    await expect(
      runCommand(async () => {
        throw new Error("quiet failure");
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).not.toContain("    at ");
  });

  it("does not print a stack trace for non-Error rejections even when verbose", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();

    await expect(
      runCommand(
        async () => {
          throw "no stack here";
        },
        { verbose: true },
      ),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).not.toContain("    at ");
  });
});

describe("requireProjectRoot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the project root when one is found", () => {
    vi.mocked(findProjectRoot).mockReturnValue("/work/app");

    expect(requireProjectRoot()).toBe("/work/app");
  });

  it("exits 1 with guidance when no project root is found", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();
    vi.mocked(findProjectRoot).mockReturnValue(null);

    expect(() => requireProjectRoot()).toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("Could not find project root");
    expect(errorOutput(err)).toContain("flisk project --yes");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("withTiltCheck", () => {
  beforeEach(() => {
    vi.mocked(getContainerRuntimeStatus).mockReturnValue("running");
    vi.mocked(isTiltAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getContainerRuntimeStatus).mockReset();
    vi.mocked(isTiltAvailable).mockReset();
  });

  it("runs the action when Docker and Tilt are available", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(withTiltCheck(async () => "started")).resolves.toBe("started");
    expect(err).not.toHaveBeenCalled();
  });

  it("reports an unresponsive Docker runtime and exits 1", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();
    const action = vi.fn(async () => "started");
    vi.mocked(getContainerRuntimeStatus).mockReturnValue("unresponsive");

    await expect(withTiltCheck(action)).rejects.toThrow("process.exit(1)");

    const output = errorOutput(err);
    expect(output).toContain("Flisk can't start - missing prerequisites");
    expect(output).toContain("Docker is running but not responding");
    expect(output).toContain("colima restart");
    expect(output).toContain("flisk doctor");
    expect(output).not.toContain("Tilt CLI is not installed");
    expect(exit).toHaveBeenCalledWith(1);
    expect(action).not.toHaveBeenCalled();
  });

  it("reports a missing Docker runtime and exits 1", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();
    vi.mocked(getContainerRuntimeStatus).mockReturnValue("missing");

    await expect(withTiltCheck(async () => "started")).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("Docker (or a compatible container runtime) is not running");
  });

  it("reports a missing Tilt install alone and exits 1", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();
    vi.mocked(isTiltAvailable).mockResolvedValue(false);

    await expect(withTiltCheck(async () => "started")).rejects.toThrow("process.exit(1)");

    const output = errorOutput(err);
    expect(output).toContain("Tilt CLI is not installed");
    expect(output).not.toContain("Docker");
  });

  it("lists every missing prerequisite, separated by a blank line", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();
    vi.mocked(getContainerRuntimeStatus).mockReturnValue("missing");
    vi.mocked(isTiltAvailable).mockResolvedValue(false);

    await expect(withTiltCheck(async () => "started")).rejects.toThrow("process.exit(1)");

    const calls = err.mock.calls.map((args) => String(args[0]));
    const dockerIndex = calls.findIndex((line) => line.includes("Docker (or a compatible"));
    const tiltIndex = calls.findIndex((line) => line.includes("Tilt CLI is not installed"));
    expect(dockerIndex).toBeGreaterThan(-1);
    expect(tiltIndex).toBeGreaterThan(dockerIndex);
    expect(calls.slice(dockerIndex + 1, tiltIndex)).toContain("");
  });

  it("routes action failures through the command error handler", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    await expect(
      withTiltCheck(async () => {
        throw new Error("up failed");
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("❌ up failed");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("showErrorAndExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the message and exits 1 by default", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    expect(() => showErrorAndExit("disk full")).toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("❌ disk full");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits with the given exit code", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    expect(() => showErrorAndExit("usage", 2)).toThrow("process.exit(2)");

    expect(exit).toHaveBeenCalledWith(2);
  });
});

describe("handleTiltFailure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the failed tilt command and exits with tilt's exit code", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = mockExit();

    expect(() => handleTiltFailure("up", 7)).toThrow("process.exit(7)");

    expect(errorOutput(err)).toContain("tilt up failed with exit code 7");
    expect(exit).toHaveBeenCalledWith(7);
  });

  it("names the down command when tilt down fails", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExit();

    expect(() => handleTiltFailure("down", 1)).toThrow("process.exit(1)");

    expect(errorOutput(err)).toContain("tilt down failed with exit code 1");
  });
});
