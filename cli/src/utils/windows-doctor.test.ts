// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  lookup: vi.fn(),
  probeHostPort: vi.fn(),
  findProjectRoot: vi.fn(),
  getProjectName: vi.fn(),
  findOnPath: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: mocks.execFileSync,
}));
vi.mock("node:dns/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:dns/promises")>()),
  lookup: mocks.lookup,
}));
vi.mock("./doctor-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./doctor-runtime.js")>()),
  probeHostPort: mocks.probeHostPort,
}));
vi.mock("./paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paths.js")>()),
  findProjectRoot: mocks.findProjectRoot,
}));
vi.mock("./service-urls.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./service-urls.js")>()),
  getProjectName: mocks.getProjectName,
}));
vi.mock("./which.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./which.js")>()),
  findOnPath: mocks.findOnPath,
}));

const {
  checkWindowsDockerMode,
  checkWindowsHostConfiguration,
  checkWindowsRuntimeTools,
  findExternallyOccupiedPorts,
  loopbackAddresses,
  parseExcludedPortRanges,
} = await import("./windows-doctor.js");

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
const originalArgv1 = process.argv[1];

function stubExec(handlers: Record<string, string | Error>) {
  mocks.execFileSync.mockImplementation((file: string) => {
    const key = Object.keys(handlers).find((name) => file === name || file.endsWith(name));
    if (key === undefined) throw new Error(`unexpected command: ${file}`);
    const outcome = handlers[key];
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
}

beforeEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.findOnPath.mockImplementation((tool: string) => `C:\\Tools\\${tool}.exe`);
  mocks.probeHostPort.mockResolvedValue("free");
  mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
  mocks.findProjectRoot.mockReturnValue(null);
  mocks.getProjectName.mockReturnValue("");
});

afterEach(() => {
  if (originalPlatform) {
    Object.defineProperty(process, "platform", originalPlatform);
  }
  process.argv[1] = originalArgv1;
});

describe("loopbackAddresses", () => {
  it("accepts IPv4, IPv6, and dual-stack loopback address lists", () => {
    expect(loopbackAddresses(["127.0.0.1"])).toBe(true);
    expect(loopbackAddresses(["::1"])).toBe(true);
    expect(loopbackAddresses(["127.0.0.1", "::1"])).toBe(true);
  });

  it("rejects empty lists and any non-loopback address", () => {
    expect(loopbackAddresses([])).toBe(false);
    expect(loopbackAddresses(["127.0.0.2"])).toBe(false);
    expect(loopbackAddresses(["10.0.0.5"])).toBe(false);
    expect(loopbackAddresses(["127.0.0.1", "192.168.1.10"])).toBe(false);
    expect(loopbackAddresses(["::1", "fe80::1"])).toBe(false);
  });
});

describe("parseExcludedPortRanges", () => {
  it("parses numeric Hyper-V TCP range rows and ignores headings", () => {
    expect(
      parseExcludedPortRanges(
        "Protocol tcp Port Exclusion Ranges\nStart Port    End Port\n----------    --------\n80            80\n50000         50059     *",
      ),
    ).toEqual([
      [80, 80],
      [50000, 50059],
    ]);
  });

  it("handles CRLF line endings and empty or non-numeric output", () => {
    expect(
      parseExcludedPortRanges(
        "Protocol tcp Port Exclusion Ranges\r\n\r\n  443   443\r\n  5400   5450   *\r\nAdministered port exclusions.\r\n",
      ),
    ).toEqual([
      [443, 443],
      [5400, 5450],
    ]);
    expect(parseExcludedPortRanges("")).toEqual([]);
  });
});

describe("findExternallyOccupiedPorts", () => {
  it("ignores ports held by the current Flisk project containers", () => {
    const holders = [
      { name: "demo_traefik", ports: "0.0.0.0:80->80/tcp", publishedPorts: [80] },
      { name: "Demo-Postgres", ports: "0.0.0.0:5432->5432/tcp", publishedPorts: [5432] },
      { name: "another-nginx", ports: "0.0.0.0:443->443/tcp", publishedPorts: [443] },
    ];
    expect(findExternallyOccupiedPorts([80, 443, 5432], holders, "demo")).toEqual([443]);
  });

  it("treats occupied ports as external when project name is empty or no container holds them", () => {
    const holders = [{ name: "demo_traefik", ports: "0.0.0.0:80->80/tcp", publishedPorts: [80] }];
    expect(findExternallyOccupiedPorts([80, 5432], holders, "")).toEqual([80, 5432]);
    expect(findExternallyOccupiedPorts([80, 5432], holders, "demo")).toEqual([5432]);
  });
});

describe("checkWindowsRuntimeTools", () => {
  it("passes when docker, tilt, powershell, and bun are on PATH", () => {
    process.argv[1] = "C:\\flisk\\bin\\flisk.exe";
    const result = checkWindowsRuntimeTools();
    expect(result).toEqual({
      name: "Windows Runtime Tools",
      didPass: true,
      message: "Docker (C:\\Tools\\docker.exe), Tilt, and Bun found on PATH",
    });
  });

  it("passes when process.argv[1] is undefined and warns when bun is absent", () => {
    (process.argv as Array<string | undefined>)[1] = undefined;
    mocks.findOnPath.mockImplementation((tool: string) =>
      tool === "bun" ? null : `C:\\Tools\\${tool}.exe`,
    );
    const result = checkWindowsRuntimeTools();
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("Bun was not found");
  });

  it("passes for an npm installation when node.exe is on PATH and fails when it is missing", () => {
    process.argv[1] =
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@flisk-sh\\flisk\\cli.js";
    expect(checkWindowsRuntimeTools().didPass).toBe(true);

    mocks.findOnPath.mockImplementation((tool: string) =>
      tool === "node" ? null : `C:\\Tools\\${tool}.exe`,
    );
    const missing = checkWindowsRuntimeTools();
    expect(missing).toMatchObject({
      name: "Windows Runtime Tools",
      didPass: false,
      message: "node.exe not found on PATH for this npm installation.",
    });
    expect(missing.fix).toContain("https://nodejs.org/");
  });

  it("fails when docker, tilt, or powershell is missing from PATH", () => {
    mocks.findOnPath.mockReturnValue(null);
    expect(checkWindowsRuntimeTools()).toMatchObject({
      name: "Windows Runtime Tools",
      didPass: false,
      message: "Docker is not running or not installed.",
    });

    mocks.findOnPath.mockImplementation((tool: string) =>
      tool === "docker" ? "C:\\Tools\\docker.exe" : null,
    );
    expect(checkWindowsRuntimeTools()).toMatchObject({
      didPass: false,
      message: "tilt.exe not found on PATH.",
    });

    mocks.findOnPath.mockImplementation((tool: string) =>
      tool === "powershell" ? null : `C:\\Tools\\${tool}.exe`,
    );
    expect(checkWindowsRuntimeTools()).toMatchObject({
      didPass: false,
      message: "powershell.exe not found on PATH; the Tilt engine runs its host scripts with it.",
    });
  });
});

describe("checkWindowsDockerMode", () => {
  it("passes when docker reports Linux containers", () => {
    stubExec({ "docker.exe": "LINUX\r\n" });
    expect(checkWindowsDockerMode()).toEqual({
      name: "Docker container mode",
      didPass: true,
      message: "Docker Desktop is using Linux containers",
    });
  });

  it("fails when docker reports Windows containers or the daemon throws", () => {
    mocks.findOnPath.mockReturnValue(null);
    stubExec({ docker: "windows\r\n" });
    const winResult = checkWindowsDockerMode();
    expect(winResult).toMatchObject({
      name: "Docker container mode",
      didPass: false,
      message: "Docker Desktop is using Windows containers. Flisk requires Linux containers.",
    });
    expect(winResult.fix).toContain("Use WSL 2 instead of Hyper-V");

    stubExec({ docker: new Error("cannot connect to daemon") });
    const errResult = checkWindowsDockerMode();
    expect(errResult).toMatchObject({
      name: "Docker container mode",
      didPass: false,
      message: "Docker daemon is not responding.",
    });
  });
});

describe("checkWindowsHostConfiguration", () => {
  it("passes on win32 when required ports are free and DNS resolves to dual-stack loopback", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
      { address: "::1", family: 6 },
    ]);
    stubExec({
      netsh: "Start Port    End Port\r\n50000         50059\r\n",
      "docker.exe": "",
      git: "false\r\n",
    });

    const result = await checkWindowsHostConfiguration();
    expect(result.name).toBe("Windows ports and DNS");
    expect(result.didPass).toBe(true);
    expect(result.fix).toBeUndefined();
    expect(result.message).toContain("File sharing must include this project directory");
    expect(result.message).not.toContain("git core.autocrlf is true");
  });

  it("falls back to plain docker binary when docker is not on PATH and handles docker ps errors", async () => {
    mocks.findOnPath.mockReturnValue(null);
    mocks.probeHostPort.mockImplementation(async (port: number) =>
      port === 80 ? "in-use" : "free",
    );
    stubExec({
      netsh: "Start Port    End Port\r\n",
      docker: new Error("docker unavailable"),
      "powershell.exe": "80: IIS / World Wide Web Publishing (HTTP.sys)\r\n",
      git: "TRUE\r\n",
    });

    const result = await checkWindowsHostConfiguration();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Ports 80 are already listening:");
    expect(result.message).toContain("IIS / World Wide Web Publishing (HTTP.sys)");
    expect(result.message).toContain("git core.autocrlf is true");
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "docker",
      ["ps", "--format", "{{.Names}}\\t{{.Ports}}"],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it("fails when example.flisk.localhost resolves to a non-loopback address", async () => {
    stubExec({
      netsh: "80 80\r\n443 443\r\n5432 5432\r\n",
      "docker.exe": "",
      git: new Error("not set"),
    });
    mocks.lookup.mockImplementation(async (host: string) =>
      host === "flisk.localhost"
        ? [{ address: "127.0.0.1", family: 4 }]
        : [
            { address: "127.0.0.1", family: 4 },
            { address: "10.0.0.9", family: 4 },
          ],
    );

    const result = await checkWindowsHostConfiguration();
    expect(result.didPass).toBe(false);
    expect(result.fix).toContain("Windows did not resolve *.flisk.localhost to 127.0.0.1.");
    expect(result.message).toContain("Windows reserved ports 80, 443, 5432 for Hyper-V/WSL.");
  });
});
