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
vi.mock("../doctor-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../doctor-runtime.js")>()),
  probeHostPort: mocks.probeHostPort,
}));
vi.mock("../paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../paths.js")>()),
  findProjectRoot: mocks.findProjectRoot,
}));
vi.mock("../service-urls.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../service-urls.js")>()),
  getProjectName: mocks.getProjectName,
}));
vi.mock("../which.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../which.js")>()),
  findOnPath: mocks.findOnPath,
}));

const { checkWindowsDockerMode, checkWindowsHostConfiguration, checkWindowsRuntimeTools } =
  await import("../windows-doctor.js");

type CommandOutputs = Record<string, string | Error>;

/** Answers execFileSync by the program it runs; an Error value is thrown, a missing program throws too. */
function stubCommands(outputs: CommandOutputs) {
  mocks.execFileSync.mockImplementation((file: string) => {
    const key = Object.keys(outputs).find((name) => file === name || file.endsWith(name));
    const output = key === undefined ? new Error(`${file}: not stubbed`) : outputs[key];
    if (output instanceof Error) throw output;
    return output;
  });
}

const loopback = [{ address: "127.0.0.1", family: 4 }];
const NO_EXCLUSIONS = "Start Port    End Port\n----------    --------\n50000         50059\n";
const originalArgv1 = process.argv[1];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.findOnPath.mockImplementation((name: string) => `C:\\bin\\${name}.exe`);
  mocks.probeHostPort.mockResolvedValue("free");
  mocks.lookup.mockResolvedValue(loopback);
  mocks.findProjectRoot.mockReturnValue(null);
});

afterEach(() => {
  process.argv[1] = originalArgv1;
});

describe("checkWindowsRuntimeTools", () => {
  it("fails with Docker Desktop setup steps when docker is not on PATH", () => {
    mocks.findOnPath.mockReturnValue(null);
    const result = checkWindowsRuntimeTools();
    expect(result).toMatchObject({
      name: "Windows Runtime Tools",
      didPass: false,
      message: "Docker is not running or not installed.",
    });
    expect(result.fix).toContain("Enable WSL2 backend");
  });

  it("fails when tilt.exe is missing", () => {
    mocks.findOnPath.mockImplementation((name: string) =>
      name === "docker" ? "docker.exe" : null,
    );
    const result = checkWindowsRuntimeTools();
    expect(result).toMatchObject({ didPass: false, message: "tilt.exe not found on PATH." });
    expect(result.fix).toContain("https://docs.tilt.dev/install.html");
  });

  it("requires node.exe only for an npm installation", () => {
    mocks.findOnPath.mockImplementation((name: string) =>
      name === "node" ? null : `C:\\bin\\${name}.exe`,
    );
    process.argv[1] = "C:\\Users\\me\\AppData\\npm\\node_modules\\@flisk-sh\\flisk\\dist\\cli.js";
    expect(checkWindowsRuntimeTools()).toMatchObject({
      didPass: false,
      message: "node.exe not found on PATH for this npm installation.",
    });

    process.argv[1] = "C:\\flisk\\flisk.exe";
    expect(checkWindowsRuntimeTools()).toMatchObject({
      didPass: true,
      message: "Docker (C:\\bin\\docker.exe), Tilt, and Bun found on PATH",
    });
  });

  it("passes with a Bun warning when Bun is missing", () => {
    mocks.findOnPath.mockImplementation((name: string) =>
      name === "bun" ? null : `C:\\bin\\${name}.exe`,
    );
    const result = checkWindowsRuntimeTools();
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("Bun was not found (generated services need Bun)");
    expect(result.message).toContain("bun --version");
  });
});

describe("checkWindowsDockerMode", () => {
  it("passes for Linux containers and asks the docker found on PATH", () => {
    stubCommands({ "docker.exe": "linux\n" });
    expect(checkWindowsDockerMode()).toEqual({
      name: "Docker container mode",
      didPass: true,
      message: "Docker Desktop is using Linux containers",
    });
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "C:\\bin\\docker.exe",
      ["info", "--format", "{{.OSType}}"],
      expect.objectContaining({ windowsHide: true, timeout: 10_000 }),
    );
  });

  it("fails for Windows containers, falling back to plain docker when not on PATH", () => {
    mocks.findOnPath.mockReturnValue(null);
    stubCommands({ docker: "Windows" });
    const result = checkWindowsDockerMode();
    expect(result).toMatchObject({
      didPass: false,
      message: "Docker Desktop is using Windows containers. Flisk requires Linux containers.",
    });
    expect(result.fix).toContain("Use WSL 2 instead of Hyper-V");
    expect(mocks.execFileSync.mock.calls[0][0]).toBe("docker");
  });

  it("fails when the daemon does not answer", () => {
    stubCommands({ docker: new Error("daemon down") });
    const result = checkWindowsDockerMode();
    expect(result).toMatchObject({ didPass: false, message: "Docker daemon is not responding." });
    expect(result.fix).toContain("Start Docker Desktop");
  });
});

describe("checkWindowsHostConfiguration", () => {
  it("passes when ports are free and DNS resolves to loopback, with only the file sharing note", async () => {
    stubCommands({ netsh: NO_EXCLUSIONS, "docker.exe": "", git: "input\n" });
    const result = await checkWindowsHostConfiguration();
    expect(result.name).toBe("Windows ports and DNS");
    expect(result.didPass).toBe(true);
    expect(result.fix).toBeUndefined();
    expect(result.message).toBe(
      "Docker Desktop Settings → Resources → File sharing must include this project directory.\n  Fix: Docker Desktop → Settings → Resources → File sharing → add project path\n  Verify: flisk doctor",
    );
    expect(mocks.probeHostPort.mock.calls.map(([port]) => port)).toEqual([80, 443, 5432]);
    expect(mocks.lookup).toHaveBeenCalledWith("example.flisk.localhost", {
      all: true,
      verbatim: true,
    });
  });

  it("warns about Hyper-V reserved ports, a failed netsh and autocrlf", async () => {
    stubCommands({ netsh: "80  80\n5000 5500\n", git: "true" });
    const reserved = await checkWindowsHostConfiguration();
    expect(reserved.didPass).toBe(true);
    expect(reserved.message).toContain("Windows reserved ports 80, 5432 for Hyper-V/WSL.");
    expect(reserved.message).toContain("git core.autocrlf is true");

    stubCommands({ netsh: "443 443\n" });
    expect((await checkWindowsHostConfiguration()).message).toContain(
      "Windows reserved port 443 for Hyper-V/WSL.",
    );

    stubCommands({ netsh: new Error("access denied") });
    const noNetsh = await checkWindowsHostConfiguration();
    expect(noNetsh.message).toContain(
      "Could not inspect Windows Hyper-V excluded TCP port ranges.",
    );
    expect(noNetsh.message).not.toContain("reserved port");
  });

  it("fails on ports held outside the project, naming their owners", async () => {
    mocks.probeHostPort.mockImplementation(async (port: number) =>
      port === 80 || port === 5432 ? "in-use" : "free",
    );
    mocks.findProjectRoot.mockReturnValue("C:\\work\\shop");
    mocks.getProjectName.mockReturnValue("shop");
    stubCommands({
      netsh: NO_EXCLUSIONS,
      "docker.exe": "shop_traefik\t0.0.0.0:80->80/tcp\nother-db\t0.0.0.0:5432->5432/tcp\n",
      "powershell.exe": "5432: PID 4242\n",
    });
    const result = await checkWindowsHostConfiguration();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("⚠️ Ports 5432 are already listening:\n5432: PID 4242");
    const powershell = mocks.execFileSync.mock.calls.find(([file]) => file === "powershell.exe");
    expect(powershell?.[1][2]).toContain("$ports = '5432'");
  });

  it("falls back to a netstat hint when the owners cannot be read", async () => {
    mocks.probeHostPort.mockImplementation(async (port: number) =>
      port === 443 ? "in-use" : "free",
    );
    stubCommands({ netsh: NO_EXCLUSIONS, "powershell.exe": "" });
    const quietOwners = await checkWindowsHostConfiguration();
    expect(quietOwners.message).toContain("⚠️ Ports 443 are already listening.");

    stubCommands({ netsh: NO_EXCLUSIONS, "powershell.exe": new Error("blocked") });
    const result = await checkWindowsHostConfiguration();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("⚠️ Ports 443 are already in use.");
    expect(result.message).toContain("netstat -ano | findstr :443");
  });

  it("fails with the hosts-file fix when *.flisk.localhost does not resolve to loopback", async () => {
    stubCommands({ netsh: NO_EXCLUSIONS });
    mocks.lookup.mockImplementation(async (host: string) => {
      if (host === "flisk.localhost") return [{ address: "10.0.0.5", family: 4 }];
      throw new Error("ENOTFOUND");
    });
    const result = await checkWindowsHostConfiguration();
    expect(result.didPass).toBe(false);
    expect(result.fix).toContain("Windows did not resolve *.flisk.localhost to 127.0.0.1.");
    expect(result.message).toContain("127.0.0.1 example.flisk.localhost");

    mocks.lookup.mockResolvedValue([]);
    expect((await checkWindowsHostConfiguration()).didPass).toBe(false);

    mocks.lookup.mockResolvedValue([{ address: "::1", family: 6 }]);
    expect((await checkWindowsHostConfiguration()).didPass).toBe(true);
  });
});
