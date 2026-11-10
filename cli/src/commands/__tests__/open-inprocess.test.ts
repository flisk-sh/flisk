// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, createTempProject, makeResource } from "../../test-support/index.js";
import type { HostPortPlan } from "../../types/index.js";
import { checkColima } from "../../utils/colima.js";
import { probeHostPort } from "../../utils/doctor-runtime.js";
import { getHostPortPlan } from "../../utils/host-port-config.js";
import { discoverResourcesWithProblems } from "../../utils/services.js";
import { openUrl } from "../../utils/url-actions.js";
import { findReadyFrontend, isFrontendReady, openCommand, openFirstFrontend } from "../open.js";

// Discovery, the saved port plan, the port probe, Colima and the browser are faked, so each case picks what the machine
// looks like. fetch is stubbed per case, and setTimeout and Date are fake so the two-minute wait runs instantly.
vi.mock("../../utils/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/services.js")>()),
  discoverResourcesWithProblems: vi.fn(),
}));
vi.mock("../../utils/host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/host-port-config.js")>()),
  getHostPortPlan: vi.fn(),
}));
vi.mock("../../utils/doctor-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/doctor-runtime.js")>()),
  probeHostPort: vi.fn(),
}));
vi.mock("../../utils/colima.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/colima.js")>()),
  checkColima: vi.fn(),
}));
vi.mock("../../utils/url-actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/url-actions.js")>()),
  openUrl: vi.fn(),
}));

const PLAN = { ingressHttp: 8080 } as HostPortPlan;
const ADMIN = "http://app.demo-shop.localhost:8080/admin";
const SHOP = "http://app.demo-shop.localhost:8080/shop";

let stdout = "";
let stderr = "";
const baseUrlBefore = process.env.FLISK_SERVICE_BASE_URL;
const exitCodeBefore = process.exitCode;

function shopProject(): string {
  const root = createTempProject({ projectJson: { project: { name: "demo-shop" } } });
  vi.mocked(discoverResourcesWithProblems).mockReturnValue({
    resources: [
      makeResource("admin", "frontend"),
      makeResource("storefront", "frontend", { basePath: "/shop" }),
      makeResource("orders-api", "backend"),
    ],
    problems: [],
  } as unknown as ReturnType<typeof discoverResourcesWithProblems>);
  return root;
}

function answer(status: (url: string) => number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => new Response("", { status: status(String(input)) })),
  );
}

/** Runs openFirstFrontend to the end, letting the fake two-second polls pass. */
async function open(root?: string): Promise<string | null> {
  const pending = openFirstFrontend(root);
  await vi.runAllTimersAsync();
  return pending;
}

beforeEach(() => {
  delete process.env.FLISK_SERVICE_BASE_URL;
  vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  stdout = "";
  stderr = "";
  process.exitCode = 0;
  openCommand.setOptionValue("print", false);
  vi.spyOn(console, "log").mockImplementation((...lines: unknown[]) => {
    stdout += `${lines.map(String).join(" ")}\n`;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as never);
  vi.spyOn(console, "error").mockImplementation((...lines: unknown[]) => {
    stderr += `${lines.map(String).join(" ")}\n`;
  });
  vi.mocked(getHostPortPlan).mockClear().mockResolvedValue(PLAN);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(openUrl).mockReset();
  vi.mocked(probeHostPort).mockReset();
  vi.mocked(checkColima).mockReset();
  vi.mocked(discoverResourcesWithProblems).mockReset();
  if (baseUrlBefore === undefined) delete process.env.FLISK_SERVICE_BASE_URL;
  else process.env.FLISK_SERVICE_BASE_URL = baseUrlBefore;
});

describe("openFirstFrontend, in process", () => {
  it("says so outside a project and opens nothing", async () => {
    const cwd = process.cwd();
    process.chdir(createTempDir());
    try {
      expect(await open()).toBeNull();
    } finally {
      process.chdir(cwd);
    }
    expect(stdout).toContain("Not in a Flisk project, so there is no frontend to open.");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("says so when the project has no frontend service", async () => {
    const root = createTempProject({ projectJson: { project: { name: "api-only" } } });
    vi.mocked(discoverResourcesWithProblems).mockReturnValue({
      resources: [makeResource("orders-api", "backend")],
      problems: [],
    } as unknown as ReturnType<typeof discoverResourcesWithProblems>);

    expect(await open(root)).toBeNull();
    expect(stdout).toContain("This project has no frontend service to open.");
    expect(stdout).toContain("add a frontend with `flisk resource`");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("waits for a booting frontend, then opens the first one that answers", async () => {
    const root = shopProject();
    let calls = 0;
    // Nothing answers on the first two polls; then only the storefront does.
    answer((url) => (++calls > 4 && url === SHOP ? 200 : 502));
    vi.mocked(openUrl).mockResolvedValue(true);

    expect(await open(root)).toBe(SHOP);

    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith(SHOP);
    expect(stdout).toContain(`  - admin: ${ADMIN}`);
    expect(stdout).toContain(`  - storefront: ${SHOP}`);
    expect(stdout).not.toContain("orders-api");
    expect(stdout).toContain(`Opened ${SHOP}`);
    expect(stderr).toContain("The frontend is up: storefront");
  });

  it("tells the user to open the URL when no browser opens", async () => {
    const root = shopProject();
    answer(() => 200);
    vi.mocked(openUrl).mockResolvedValue(false);

    expect(await open(root)).toBe(ADMIN);
    expect(stdout).toContain(`Could not open a browser. Open ${ADMIN} yourself.`);
  });

  it("says the stack is not serving yet when the published port answers but no frontend does", async () => {
    const root = shopProject();
    answer(() => 503);
    vi.mocked(probeHostPort).mockResolvedValue("in-use");

    expect(await open(root)).toBeNull();

    expect(probeHostPort).toHaveBeenCalledWith(8080);
    expect(stderr).toContain("No frontend answered yet.");
    expect(stdout).toContain("The stack is not serving the frontend yet.");
    expect(stdout).toContain("Start the stack in another terminal: flisk up");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("says the stack is not serving yet when there is no saved port plan", async () => {
    const root = shopProject();
    vi.mocked(getHostPortPlan).mockResolvedValue(null as unknown as HostPortPlan);
    answer(() => 503);

    expect(await open(root)).toBeNull();
    expect(probeHostPort).not.toHaveBeenCalled();
    expect(stdout).toContain("The stack is not serving the frontend yet.");
  });

  it("names the stopped Colima VM when the published port cannot be reached", async () => {
    const root = shopProject();
    answer(() => 503);
    vi.mocked(probeHostPort).mockResolvedValue("free");
    vi.mocked(checkColima).mockReturnValue({
      isColima: true,
      running: false,
      problem: "The Colima VM is stopped",
      fix: "colima start --cpu 4",
    } as ReturnType<typeof checkColima>);

    expect(await open(root)).toBeNull();

    expect(stdout).toContain("The stack is running, but this machine cannot reach port 8080.");
    expect(stdout).toContain("Docker is not publishing the port to the host.");
    expect(stdout).toContain("The Colima VM is stopped");
    expect(stdout).toContain("Fix: colima start --cpu 4");
    expect(stdout).toContain(`  - admin: ${ADMIN}`);
  });

  it("falls back to the default Colima advice when it gives no problem or fix", async () => {
    const root = shopProject();
    answer(() => 503);
    vi.mocked(probeHostPort).mockResolvedValue("free");
    vi.mocked(checkColima).mockReturnValue({ isColima: true, running: false } as ReturnType<
      typeof checkColima
    >);

    expect(await open(root)).toBeNull();
    expect(stdout).toContain("The Colima VM is not running");
    expect(stdout).toContain("Fix: colima start");
  });

  it("asks to restart the Docker runtime when it is not Colima", async () => {
    const root = shopProject();
    answer(() => 503);
    vi.mocked(probeHostPort).mockResolvedValue("free");
    vi.mocked(checkColima).mockReturnValue({ isColima: false, running: true } as ReturnType<
      typeof checkColima
    >);

    expect(await open(root)).toBeNull();
    expect(stdout).toContain("Restart the Docker runtime (Docker Desktop or Colima)");
  });
});

describe("frontend readiness", () => {
  it("treats a refused connection as not ready, and a 4xx as ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (String(input).includes("refused")) throw new TypeError("fetch failed");
        return new Response("", { status: 404 });
      }),
    );
    expect(await isFrontendReady("http://refused.localhost/")).toBe(false);
    expect(await isFrontendReady("http://app.localhost/")).toBe(true);
  });

  it("finds the running frontend of a project without waiting", async () => {
    const root = shopProject();
    answer((url) => (url === SHOP ? 200 : 503));
    expect(await findReadyFrontend(root)).toEqual({ name: "storefront", url: SHOP });
  });
});

describe("flisk open, in process", () => {
  async function print(root: string): Promise<void> {
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const pending = openCommand.exitOverride().parseAsync(["--print"], { from: "user" });
      const result = pending.catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      const error = await result;
      if (error instanceof Error) throw error;
    } finally {
      process.chdir(cwd);
    }
  }

  it("prints only the first ready frontend URL without opening a browser", async () => {
    const root = shopProject();
    answer((url) => (url === SHOP ? 200 : 503));

    await print(root);

    expect(stdout).toBe(`${SHOP}\n`);
    expect(stderr).toBe("");
    expect(process.exitCode).toBe(0);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("prints the local frontend port rather than a gateway URL", async () => {
    const root = shopProject();
    vi.mocked(discoverResourcesWithProblems).mockReturnValue({
      resources: [makeResource("web", "frontend", { command: "npm run dev", port: 5173 })],
      problems: [],
    } as unknown as ReturnType<typeof discoverResourcesWithProblems>);
    answer(() => 200);

    await print(root);

    expect(stdout).toBe("http://localhost:5173\n");
    expect(stderr).toBe("");
    expect(openUrl).not.toHaveBeenCalled();
    expect(getHostPortPlan).not.toHaveBeenCalled();
  });

  it("fails on stderr with no URL outside a project", async () => {
    await print(createTempDir());

    expect(stdout).toBe("");
    expect(stderr).toContain("Not in a Flisk project");
    expect(process.exitCode).toBe(1);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("fails on stderr with no URL when there is no frontend", async () => {
    const root = shopProject();
    vi.mocked(discoverResourcesWithProblems).mockReturnValue({ resources: [], problems: [] });

    await print(root);

    expect(stdout).toBe("");
    expect(stderr).toContain("no frontend service");
    expect(process.exitCode).toBe(1);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("fails on stderr when no frontend becomes ready", async () => {
    const root = shopProject();
    answer(() => 503);

    await print(root);

    expect(stdout).toBe("");
    expect(stderr).toContain("No frontend answered yet");
    expect(process.exitCode).toBe(1);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("opens the first frontend of the project it runs in", async () => {
    const root = shopProject();
    answer(() => 200);
    vi.mocked(openUrl).mockResolvedValue(true);
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const pending = openCommand.parseAsync([], { from: "user" });
      await vi.runAllTimersAsync();
      await pending;
    } finally {
      process.chdir(cwd);
    }
    expect(openUrl).toHaveBeenCalledWith(ADMIN);
  });
});
