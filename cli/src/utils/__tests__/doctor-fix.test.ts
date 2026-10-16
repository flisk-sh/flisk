// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyDoctorFixes,
  checkDuplicateTdkInstalls,
  createDockerFixDeps,
  type DockerNetwork,
  type DoctorFixDeps,
  hasFailedActions,
  parseElapsed,
  planDoctorFixes,
  projectTiltPids,
} from "../doctor-fix.js";

function fakeDocker(
  networks: DockerNetwork[],
  alive: number[] = [],
  failing: string[] = [],
  tilt: Record<number, "healthy" | "stale" | "unknown"> = {},
) {
  const removed: string[] = [];
  const stopped: number[] = [];
  const deps: DoctorFixDeps = {
    listNetworks: async () => networks,
    removeNetwork: async (name) => {
      if (failing.includes(name)) throw new Error(`network ${name} has active endpoints`);
      removed.push(name);
    },
    isProcessAlive: (pid) => alive.includes(pid),
    tiltStatus: async (pid) => tilt[pid] ?? "unknown",
    stopProcess: (pid) => {
      stopped.push(pid);
    },
  };
  return { deps, removed, stopped };
}

const net = (name: string, containers = 0): DockerNetwork => ({ name, containers });

describe("planDoctorFixes", () => {
  it("plans unused networks of this project and leftover probes", async () => {
    const { deps } = fakeDocker([
      net("it_ai_search_backend"),
      net("tdk_doctor_probe_111"),
      net("bridge"),
    ]);
    const plan = await planDoctorFixes("it-ai-search", deps);
    expect(plan.map((a) => [a.id, a.scope, a.status])).toEqual([
      ["remove-network:it_ai_search_backend", "project", "planned"],
      ["remove-network:tdk_doctor_probe_111", "probe", "planned"],
    ]);
    expect(plan[0]?.command).toBe("docker network rm it_ai_search_backend");
  });

  it("never plans another project's networks", async () => {
    const { deps } = fakeDocker([net("umami_backend"), net("tdk_restaurant_example_database")]);
    expect(await planDoctorFixes("it-ai-search", deps)).toEqual([]);
  });

  it("skips project networks while Tilt runs, but still plans probes", async () => {
    const { deps } = fakeDocker([net("it_ai_search_backend"), net("tdk_doctor_probe_5")]);
    const plan = await planDoctorFixes("it-ai-search", deps, { tiltPids: [7] });
    expect(plan.map((a) => [a.scope, a.status])).toEqual([
      ["project", "skipped"],
      ["probe", "planned"],
    ]);
    expect(plan[0]?.reason).toContain("Tilt is running for this project (pid 7)");
  });

  it("skips a network that still has containers", async () => {
    const { deps } = fakeDocker([net("it_ai_search_database", 2)]);
    const [action] = await planDoctorFixes("it-ai-search", deps);
    expect(action?.status).toBe("skipped");
    expect(action?.reason).toContain("2 container");
  });

  it("skips the probe of a process that is still running", async () => {
    const { deps } = fakeDocker([net("tdk_doctor_probe_42"), net("tdk_doctor_probe_43")], [42]);
    const plan = await planDoctorFixes(undefined, deps);
    expect(plan.map((a) => a.status)).toEqual(["skipped", "planned"]);
  });

  it("only plans probes outside a project", async () => {
    const { deps } = fakeDocker([net("it_ai_search_backend"), net("tdk_doctor_probe_7")]);
    const plan = await planDoctorFixes(undefined, deps);
    expect(plan.map((a) => a.id)).toEqual(["remove-network:tdk_doctor_probe_7"]);
  });
});

describe("applyDoctorFixes", () => {
  const networks = [net("it_ai_search_backend"), net("it_ai_search_database")];

  it("changes nothing on a dry run", async () => {
    const { deps, removed } = fakeDocker(networks);
    const plan = await planDoctorFixes("it-ai-search", deps);
    const result = await applyDoctorFixes(plan, { dryRun: true }, deps);
    expect(removed).toEqual([]);
    expect(result.every((a) => a.status === "planned")).toBe(true);
  });

  it("removes confirmed networks", async () => {
    const { deps, removed } = fakeDocker(networks);
    const plan = await planDoctorFixes("it-ai-search", deps);
    const result = await applyDoctorFixes(plan, { dryRun: false, confirm: async () => true }, deps);
    expect(removed).toEqual(["it_ai_search_backend", "it_ai_search_database"]);
    expect(result.map((a) => a.status)).toEqual(["applied", "applied"]);
  });

  it("skips what the user declines", async () => {
    const { deps, removed } = fakeDocker(networks);
    const plan = await planDoctorFixes("it-ai-search", deps);
    const result = await applyDoctorFixes(
      plan,
      { dryRun: false, confirm: async (a) => a.id.endsWith("database") },
      deps,
    );
    expect(removed).toEqual(["it_ai_search_database"]);
    expect(result.map((a) => a.status)).toEqual(["skipped", "applied"]);
  });

  it("skips everything when no confirmation is available", async () => {
    const { deps, removed } = fakeDocker(networks);
    const plan = await planDoctorFixes("it-ai-search", deps);
    const result = await applyDoctorFixes(plan, { dryRun: false }, deps);
    expect(removed).toEqual([]);
    expect(result[0]?.reason).toContain("--yes");
  });

  it("treats a prompt with no terminal as declined", async () => {
    const { deps, removed } = fakeDocker(networks);
    const plan = await planDoctorFixes("it-ai-search", deps);
    const result = await applyDoctorFixes(
      plan,
      {
        dryRun: false,
        confirm: async () => {
          throw new Error("No input available");
        },
      },
      deps,
    );
    expect(removed).toEqual([]);
    expect(result.map((a) => a.status)).toEqual(["skipped", "skipped"]);
  });

  it("reports a failed removal and carries on", async () => {
    const { deps, removed } = fakeDocker(networks, [], ["it_ai_search_backend"]);
    const plan = await planDoctorFixes("it-ai-search", deps);
    const result = await applyDoctorFixes(plan, { dryRun: false, confirm: async () => true }, deps);
    expect(result.map((a) => a.status)).toEqual(["failed", "applied"]);
    expect(removed).toEqual(["it_ai_search_database"]);
    expect(hasFailedActions(result)).toBe(true);
  });

  it("converges on a second run", async () => {
    const live = [...networks];
    const deps: DoctorFixDeps = {
      listNetworks: async () => [...live],
      removeNetwork: async (name) => {
        live.splice(
          live.findIndex((n) => n.name === name),
          1,
        );
      },
      isProcessAlive: () => false,
      tiltStatus: async () => "unknown",
      stopProcess: () => {},
    };
    await applyDoctorFixes(
      await planDoctorFixes("it-ai-search", deps),
      { dryRun: false, confirm: async () => true },
      deps,
    );
    expect(await planDoctorFixes("it-ai-search", deps)).toEqual([]);
  });
});

describe("checkDuplicateTdkInstalls", () => {
  it("passes with one install", async () => {
    const result = await checkDuplicateTdkInstalls([{ path: "/usr/bin/tdk", version: "1.3.155" }]);
    expect(result.didPass).toBe(true);
  });

  it("warns with both paths and versions when installs differ", async () => {
    const result = await checkDuplicateTdkInstalls([
      { path: "/opt/bin/tdk", version: "1.3.155" },
      { path: "/usr/local/bin/tdk", version: "1.3.144" },
    ]);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("/usr/local/bin/tdk (1.3.144)");
    expect(result.message).toContain("different versions");
  });
});

describe("createDockerFixDeps", () => {
  it("lists networks with their container counts and skips one removed mid-listing", async () => {
    const calls: string[][] = [];
    const deps = createDockerFixDeps(async (args) => {
      calls.push(args);
      if (args[1] === "ls") return "bridge\nit_ai_search_backend\ntdk_doctor_probe_1\n";
      const name = args.at(-1);
      if (name === "tdk_doctor_probe_1") {
        throw new Error("Error response from daemon: network tdk_doctor_probe_1 not found");
      }
      return name === "bridge" ? "2\n" : "0\n";
    });
    expect(await deps.listNetworks()).toEqual([
      { name: "bridge", containers: 2 },
      { name: "it_ai_search_backend", containers: 0 },
    ]);
  });

  it("lets other inspect failures through", async () => {
    const deps = createDockerFixDeps(async (args) => {
      if (args[1] === "ls") return "bridge\n";
      throw new Error("Cannot connect to the Docker daemon");
    });
    await expect(deps.listNetworks()).rejects.toThrow("Cannot connect");
  });

  it("reports only the first line of a removal error", async () => {
    const deps = createDockerFixDeps(async () => {
      throw Object.assign(new Error("failed"), { stderr: "has active endpoints\nmore detail" });
    });
    await expect(deps.removeNetwork("x")).rejects.toThrow(/^has active endpoints$/);
  });
});

describe("projectTiltPids", () => {
  it("finds a Tilt launched through a symlinked project path or the resolved one", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "doctor-fix-")));
    const real = join(base, "real");
    mkdirSync(real);
    const link = join(base, "link");
    symlinkSync(real, link);
    const launched = new Map([
      [join(link, ".tdk", ".tdk-out", "Tiltfile"), [11]],
      [join(real, ".tdk", ".tdk-out", "Tiltfile"), [12]],
    ]);
    const find = (path: string) => launched.get(path) ?? [];
    expect(projectTiltPids(link, find).sort()).toEqual([11, 12]);
    expect(projectTiltPids(join(base, "nope"), find)).toEqual([]);
  });
});

describe("stale Tilt", () => {
  it("plans to stop a Tilt whose UI does not answer, and frees the project's networks in the same run", async () => {
    const { deps } = fakeDocker([net("it_ai_search_backend")], [], [], { 7: "stale" });
    const plan = await planDoctorFixes("it-ai-search", deps, { tiltPids: [7] });
    expect(plan.map((a) => [a.id, a.status])).toEqual([
      ["stop-tilt:7", "planned"],
      ["remove-network:it_ai_search_backend", "planned"],
    ]);
    expect(plan[0]?.command).toBe("kill -TERM 7");
  });

  it("leaves a healthy or unknown Tilt alone and protects the networks", async () => {
    for (const status of ["healthy", "unknown"] as const) {
      const { deps } = fakeDocker([net("it_ai_search_backend")], [], [], { 7: status });
      const plan = await planDoctorFixes("it-ai-search", deps, { tiltPids: [7] });
      expect(plan.map((a) => [a.id, a.status])).toEqual([
        ["remove-network:it_ai_search_backend", "skipped"],
      ]);
    }
  });

  it("stops the process only after confirmation", async () => {
    const { deps, stopped } = fakeDocker([], [], [], { 7: "stale" });
    const plan = await planDoctorFixes("p", deps, { tiltPids: [7] });
    await applyDoctorFixes(plan, { dryRun: false, confirm: async () => false }, deps);
    expect(stopped).toEqual([]);
    const result = await applyDoctorFixes(plan, { dryRun: false, confirm: async () => true }, deps);
    expect(stopped).toEqual([7]);
    expect(result[0]?.status).toBe("applied");
  });
});

describe("--scope=machine", () => {
  const machineNets = [
    net("umami_traefik-public"),
    net("umami_backend"),
    net("umami_database", 1),
    net("shop_backend"),
    net("shop_database"),
    net("it_ai_search_backend"),
  ];

  it("plans other TDK projects' unused networks naming the owner", async () => {
    const { deps } = fakeDocker(machineNets);
    const plan = await planDoctorFixes("it-ai-search", deps, { machine: true });
    const byId = Object.fromEntries(plan.map((a) => [a.id, a]));
    expect(byId["remove-network:umami_backend"]?.scope).toBe("machine");
    expect(byId["remove-network:umami_backend"]?.reason).toContain('project "umami"');
    expect(byId["remove-network:umami_traefik-public"]?.status).toBe("planned");
    expect(byId["remove-network:umami_database"]?.status).toBe("skipped");
    expect(byId["remove-network:it_ai_search_backend"]?.scope).toBe("project");
  });

  it("never touches networks of a project without a Traefik network, or without the flag", async () => {
    const { deps } = fakeDocker(machineNets);
    const withFlag = await planDoctorFixes("it-ai-search", deps, { machine: true });
    expect(withFlag.some((a) => a.id.includes("shop_"))).toBe(false);
    const without = await planDoctorFixes("it-ai-search", deps);
    expect(without.map((a) => a.id)).toEqual(["remove-network:it_ai_search_backend"]);
  });
});

describe("parseElapsed", () => {
  it("reads ps etime", () => {
    expect(parseElapsed("01:05")).toBe(65);
    expect(parseElapsed("02:01:05")).toBe(7265);
    expect(parseElapsed("1-00:00:10")).toBe(86410);
    expect(parseElapsed("nope")).toBeNull();
  });
});
