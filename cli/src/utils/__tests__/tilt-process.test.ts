// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FliskError } from "../errors.js";
import { findTiltProcessIdsOnPort, stopTiltOnPort } from "../tilt-process.js";

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: execFileSyncMock,
}));

const TEST_PORT = 10350;

describe("tilt-process direct unit tests", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("findTiltProcessIdsOnPort", () => {
    describe("Scenario A — One listener", () => {
      it("parses single valid PID listening on port on Unix/Linux", () => {
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "lsof") return "54321\n";
          if (command === "ps" && args[1] === "54321") return "/usr/local/bin/tilt\n";
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "linux", runner);
        expect(pids).toEqual([54321]);
        expect(runner).toHaveBeenCalledWith("lsof", [
          "-nP",
          "-t",
          `-iTCP:${TEST_PORT}`,
          "-sTCP:LISTEN",
        ]);
        expect(runner).toHaveBeenCalledWith("ps", ["-p", "54321", "-o", "comm="]);
      });

      it("parses single valid PID listening on port on macOS (darwin)", () => {
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "lsof") return "9876\n";
          if (command === "ps" && args[1] === "9876") return "/opt/homebrew/bin/tilt\n";
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "darwin", runner);
        expect(pids).toEqual([9876]);
      });

      it("parses single valid PID on Windows using powershell.exe", () => {
        const runner = vi.fn((command: string, _args: string[]) => {
          if (command === "powershell.exe") return "1234\r\n";
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "win32", runner);
        expect(pids).toEqual([1234]);
        expect(runner).toHaveBeenCalledWith(
          "powershell.exe",
          expect.arrayContaining(["-NoProfile", "-Command"]),
        );
      });
    });

    describe("Scenario B — No listener", () => {
      it("returns empty array when lsof output is empty string", () => {
        const runner = vi.fn((command: string) => {
          if (command === "lsof") return "";
          return "";
        });

        expect(findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toEqual([]);
      });

      it("returns empty array when lsof returns whitespace only", () => {
        const runner = vi.fn((command: string) => {
          if (command === "lsof") return "   \n\t  \n";
          return "";
        });

        expect(findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toEqual([]);
      });

      it("returns empty array when lsof exits with status 1 and empty stderr (standard no listener)", () => {
        const runner = vi.fn(() => {
          const err = new Error("Command failed: lsof") as Error & {
            status: number;
            stderr: Buffer;
          };
          err.status = 1;
          err.stderr = Buffer.from("");
          throw err;
        });

        expect(findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toEqual([]);
      });

      it("returns empty array when Windows powershell returns no output", () => {
        const runner = vi.fn((command: string) => {
          if (command === "powershell.exe") return "\r\n";
          return "";
        });

        expect(findTiltProcessIdsOnPort(TEST_PORT, "win32", runner)).toEqual([]);
      });

      it.each([0, -1, 65536, 10350.5, Number.NaN])(
        "rejects invalid port %s immediately without executing commands",
        (invalidPort) => {
          const runner = vi.fn();
          expect(findTiltProcessIdsOnPort(invalidPort, "linux", runner)).toEqual([]);
          expect(findTiltProcessIdsOnPort(invalidPort, "win32", runner)).toEqual([]);
          expect(runner).not.toHaveBeenCalled();
        },
      );
    });

    describe("Scenario C — Two listeners", () => {
      it("returns both matching PIDs when two tilt listeners exist", () => {
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "lsof") return "1111\n2222\n";
          if (command === "ps" && (args[1] === "1111" || args[1] === "2222")) {
            return "tilt\n";
          }
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "linux", runner);
        expect(pids).toEqual([1111, 2222]);
      });

      it("returns multiple matching PIDs on Windows", () => {
        const runner = vi.fn((command: string) => {
          if (command === "powershell.exe") return "1111\r\n2222\r\n";
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "win32", runner);
        expect(pids).toEqual([1111, 2222]);
      });

      it("filters out processes that are not named tilt", () => {
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "lsof") return "1111\n2222\n3333\n";
          if (command === "ps" && args[1] === "1111") return "/usr/local/bin/tilt\n";
          if (command === "ps" && args[1] === "2222") return "/usr/bin/nginx\n";
          if (command === "ps" && args[1] === "3333") return "/usr/local/bin/tilt\n";
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "linux", runner);
        expect(pids).toEqual([1111, 3333]);
      });

      it("handles Windows executable path in ps output", () => {
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "lsof") return "4444\n";
          if (command === "ps" && args[1] === "4444") return "C:\\Program Files\\Tilt\\tilt\n";
          return "";
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "linux", runner);
        expect(pids).toEqual([4444]);
      });
    });

    describe("Error and diagnostic safety", () => {
      it("throws FliskError when lsof fails with an error and non-empty stderr", () => {
        const runner = vi.fn(() => {
          const err = new Error("Permission denied") as Error & { status: number; stderr: Buffer };
          err.status = 1;
          err.stderr = Buffer.from("lsof: permission denied");
          throw err;
        });

        expect(() => findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toThrow(FliskError);
        expect(() => findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toThrow(
          /Unable to inspect listeners on port 10350/,
        );
      });

      it("throws FliskError when ps command fails to inspect listener", () => {
        const runner = vi.fn((command: string) => {
          if (command === "lsof") return "5555\n";
          if (command === "ps") throw new Error("ps execution failed");
          return "";
        });

        expect(() => findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toThrow(FliskError);
        expect(() => findTiltProcessIdsOnPort(TEST_PORT, "linux", runner)).toThrow(
          /Unable to identify the process listening on port 10350/,
        );
      });

      it("throws FliskError when PowerShell fails on Windows", () => {
        const runner = vi.fn(() => {
          throw new Error("PowerShell not found");
        });

        expect(() => findTiltProcessIdsOnPort(TEST_PORT, "win32", runner)).toThrow(FliskError);
        expect(() => findTiltProcessIdsOnPort(TEST_PORT, "win32", runner)).toThrow(
          /Unable to inspect Tilt listeners on port 10350 with PowerShell/,
        );
      });

      it("safely uses the default mocked execFileSync runner when runner is omitted", () => {
        execFileSyncMock.mockImplementation((command: string) => {
          if (command === "lsof") return "7777\n";
          if (command === "ps") return "tilt\n";
          throw new Error(`Unexpected command: ${command}`);
        });

        const pids = findTiltProcessIdsOnPort(TEST_PORT, "linux");
        expect(pids).toEqual([7777]);
        expect(execFileSyncMock).toHaveBeenCalled();
      });
    });
  });

  describe("stopTiltOnPort", () => {
    describe("Scenario D — No-PID shutdown", () => {
      it("does nothing and sends no signals when no matching Tilt PID is found on Linux", () => {
        const terminated: string[][] = [];
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "kill" || command === "taskkill.exe") {
            terminated.push([command, ...args]);
            return "";
          }
          if (command === "lsof") return "";
          return "";
        });

        const result = stopTiltOnPort(TEST_PORT, "linux", runner);
        expect(result).toEqual([]);
        expect(terminated).toHaveLength(0);
        expect(runner).not.toHaveBeenCalledWith("kill", expect.anything());
        expect(runner).not.toHaveBeenCalledWith("taskkill.exe", expect.anything());
      });

      it("does nothing and sends no signals when no matching Tilt PID is found on Windows", () => {
        const runner = vi.fn((command: string) => {
          if (command === "powershell.exe") return "";
          return "";
        });

        const result = stopTiltOnPort(TEST_PORT, "win32", runner);
        expect(result).toEqual([]);
        expect(runner).not.toHaveBeenCalledWith("taskkill.exe", expect.anything());
        expect(runner).not.toHaveBeenCalledWith("kill", expect.anything());
      });

      it("does nothing for an invalid port without signaling", () => {
        const runner = vi.fn();
        const result = stopTiltOnPort(-10, "linux", runner);
        expect(result).toEqual([]);
        expect(runner).not.toHaveBeenCalled();
      });
    });

    describe("Termination with matching PIDs", () => {
      it("terminates all matching processes with SIGTERM on Unix", () => {
        const killCalls: string[][] = [];
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "lsof") return "1001\n1002\n";
          if (command === "ps") return "/bin/tilt\n";
          if (command === "kill") {
            killCalls.push([command, ...args]);
            return "";
          }
          return "";
        });

        const stopped = stopTiltOnPort(TEST_PORT, "linux", runner);
        expect(stopped).toEqual([1001, 1002]);
        expect(killCalls).toEqual([
          ["kill", "-TERM", "1001"],
          ["kill", "-TERM", "1002"],
        ]);
      });

      it("terminates all matching processes with taskkill.exe on Windows", () => {
        const taskkillCalls: string[][] = [];
        const runner = vi.fn((command: string, args: string[]) => {
          if (command === "powershell.exe") return "2001\r\n2002\r\n";
          if (command === "taskkill.exe") {
            taskkillCalls.push([command, ...args]);
            return "";
          }
          return "";
        });

        const stopped = stopTiltOnPort(TEST_PORT, "win32", runner);
        expect(stopped).toEqual([2001, 2002]);
        expect(taskkillCalls).toEqual([
          ["taskkill.exe", "/PID", "2001", "/F"],
          ["taskkill.exe", "/PID", "2002", "/F"],
        ]);
      });
    });
  });
});
