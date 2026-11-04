// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTempDir,
  createTempProject,
  parseEnvelope,
  runCommandInProcess,
} from "../../test-support/index.js";
import { type AgentReply, fetchAgent } from "../../utils/agent-sessions.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { getHostPortPlan } from "../../utils/host-port-config.js";
import { buildServicePorts } from "../../utils/status-ports.js";
import { agentCommand } from "../agent.js";

// No agent is ever reached: fetchAgent is faked, so each case says what the agent answered.
vi.mock("../../utils/agent-sessions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/agent-sessions.js")>()),
  fetchAgent: vi.fn(),
}));

vi.mock("../../utils/host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/host-port-config.js")>()),
  getHostPortPlan: vi.fn(),
}));

vi.mock("../../utils/status-ports.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/status-ports.js")>();
  return { ...actual, buildServicePorts: vi.fn(actual.buildServicePorts) };
});

const LISTED = {
  sessions: [
    { sessionId: "s-1", lastActivity: null, status: "idle", checkpointBytes: 2048 },
    { sessionId: "s-2", lastActivity: null, status: "running", checkpointBytes: null },
  ],
  total: 2,
};

function botProject(): string {
  return createTempProject({ resources: { bot: { appType: "agent", port: 4999 } } });
}

/** Every flag is passed on each run: Commander keeps option values between parses of the same command object. */
function run(root: string, args: string[], flags: { json?: boolean; watch?: boolean } = {}) {
  return runCommandInProcess(
    agentCommand,
    ["sessions", ...args, ...(flags.json ? ["--json"] : []), ...(flags.watch ? ["--watch"] : [])],
    root,
  );
}

const sessionsCommand = agentCommand.commands.find((c) => c.name() === "sessions");

beforeEach(() => {
  clearDiscoveryCache();
  sessionsCommand?.setOptionValue("json", false);
  sessionsCommand?.setOptionValue("watch", false);
  sessionsCommand?.setOptionValue("sessionId", undefined);
  vi.mocked(getHostPortPlan).mockResolvedValue({ ingressHttp: 8080 } as never);
});

afterEach(() => {
  vi.mocked(fetchAgent).mockReset();
  vi.mocked(getHostPortPlan).mockReset();
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("flisk agent sessions in-process", () => {
  it("prints the NOT_IN_PROJECT envelope outside a Flisk project", async () => {
    const result = await run(createTempDir(), ["bot"], { json: true });
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout.split("\n")[0] ?? "");
    expect(envelope.errors?.[0]?.message).toContain("Could not find project root");
    expect(fetchAgent).not.toHaveBeenCalled();
  });

  it("explains a missing project root to a human", async () => {
    const result = await run(createTempDir(), ["bot"]);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("Could not find project root");
  });

  it("reports NO_ROUTE when the agent has no ingress route, even when the port plan fails", async () => {
    vi.mocked(getHostPortPlan).mockRejectedValue(new Error("no plan"));
    vi.mocked(buildServicePorts).mockReturnValueOnce({
      url: null,
      containerPort: 4999,
      hostPort: null,
      directUrl: null,
      extraPorts: [],
    });
    const result = await run(botProject(), ["bot"], { json: true });
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout.split("\n")[0] ?? "");
    expect(envelope.errors?.[0]?.code).toBe("NO_ROUTE");
    expect(fetchAgent).not.toHaveBeenCalled();
  });

  it("prints the session list envelope with --json", async () => {
    vi.mocked(fetchAgent).mockResolvedValue({ kind: "ok", body: LISTED });
    const result = await run(botProject(), ["bot"], { json: true });
    expect(result.status).toBeUndefined();
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toMatchObject({ agent: "bot", port: 4999, total: 2 });
    expect(fetchAgent).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/sessions") }),
    );
  });

  it("reaches an agent that runs as a local process on localhost at its own port", async () => {
    vi.mocked(fetchAgent).mockResolvedValue({ kind: "ok", body: LISTED });
    const root = createTempProject({
      resources: { bot: { appType: "agent", port: 4999, command: "node server.js" } },
    });
    const result = await run(root, ["bot"], { json: true });
    expect(result.status).toBeUndefined();
    expect(fetchAgent).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://localhost:4999/sessions" }),
    );
  });

  it("reports SESSION_LIST_UNSUPPORTED when the agent answers /sessions with another shape", async () => {
    vi.mocked(fetchAgent).mockResolvedValue({ kind: "ok", body: { hello: "world" } });
    const result = await run(botProject(), ["bot"], { json: true });
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout.split("\n")[0] ?? "");
    expect(envelope.errors?.[0]?.code).toBe("SESSION_LIST_UNSUPPORTED");
  });

  it("reports AGENT_REQUEST_FAILED when the agent fails to list its sessions", async () => {
    vi.mocked(fetchAgent).mockResolvedValue({ kind: "error", status: 500, detail: "boom" });
    const result = await run(botProject(), ["bot"], { json: true });
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout.split("\n")[0] ?? "");
    expect(envelope.errors?.[0]).toMatchObject({
      code: "AGENT_REQUEST_FAILED",
      message: "Agent returned 500: boom",
    });
  });

  it.each<[string, AgentReply, string]>([
    ["is not running", { kind: "not-running" }, "AGENT_NOT_RUNNING"],
    [
      "has no such session",
      { kind: "not-found", body: { error: "gone" } },
      "Agent returned 404: gone",
    ],
    ["answers 404 without an error field", { kind: "not-found", body: { x: 1 } }, '404: {"x":1}'],
    ["fails the session request", { kind: "error", status: 503, detail: "busy" }, "503: busy"],
  ])("tells a human when the agent %s for one session", async (_label, reply, expected) => {
    vi.mocked(fetchAgent).mockResolvedValue(reply);
    const result = await run(botProject(), ["bot", "--session-id", "s-1"]);
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain(
      expected === "AGENT_NOT_RUNNING" ? 'Agent "bot" is not responding' : expected,
    );
  });

  it("redraws on each refresh, shows a failed refresh, and keeps going", async () => {
    vi.mocked(fetchAgent)
      .mockResolvedValueOnce({ kind: "not-running" })
      .mockResolvedValueOnce({ kind: "ok", body: LISTED })
      .mockRejectedValueOnce(new Error("interrupted"));
    // Each 2-second wait between refreshes ends at once, so the loop runs until the third request stops it.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as never);
    const result = await run(botProject(), ["bot"], { watch: true });
    expect(fetchAgent).toHaveBeenCalledTimes(3);
    // Each refresh clears the screen before it redraws.
    expect(result.stdout.split("\x1b[2J\x1b[H").length - 1).toBe(2);
    expect(result.stdout).toContain('Agent "bot" is not responding');
    expect(result.stdout).toContain("Start the stack with: flisk up");
    expect(result.stdout).toContain("Sessions for bot:");
    expect(result.stdout).toContain("s-2");
    expect(result.stdout).toContain("Refreshing every 2s. Ctrl+C to stop.");
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toContain("interrupted");
  });
});
