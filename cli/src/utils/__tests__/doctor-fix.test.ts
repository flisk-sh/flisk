// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ColimaStatus } from "../colima.js";
import {
  anyTiltAnswers,
  applyDoctorFixes,
  checkDuplicateFliskInstalls,
  createDockerFixDeps,
  type DockerNetwork,
  type DoctorFixDeps,
  dockerFixDeps,
  findFliskInstalls,
  hasFailedActions,
  parseElapsed,
  planDoctorFixes,
  projectTiltPids,
  runColima,
} from "../doctor-fix.js";

function fakeDocker(
  networks: DockerNetwork[],
  alive: number[] = [],
  failing: string[] = [],
  tilt: Record<number, "healthy" | "stale" | "unknown"> = {},
  disk: { freeGib: number | null; buildCache?: string | null; dangling?: number } = {
    freeGib: 100,
  },
) {
  const removed: string[] = [];
  const pruned: string[] = [];
  const trimmed: string[] = [];
  const stopped: number[] = [];
  const colimaActions: string[] = [];
  const colimaState: ColimaStatus = { isColima: false, running: true };
  const dockerIsUp = { value: true };
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
    freeDiskGib: () => disk.freeGib,
    reclaimable: async () => ({
      buildCache: disk.buildCache ?? null,
      danglingImages: disk.dangling ?? 0,
    }),
    colima: async (action) => {
      colimaActions.push(action);
    },
    colimaStatus: () => colimaState,
    dockerAnswers: () => dockerIsUp.value,
    prune: async (kind) => {
      pruned.push(kind);
    },
    trimColima: async () => {
      trimmed.push("fstrim");
    },
  };
  return { deps, removed, stopped, pruned, trimmed, colimaState };
}

const net = (name: string, containers = 0): DockerNetwork => ({ name, containers });

describe("planDoctorFixes", () => {
  it("plans unused networks of this project and leftover probes", async () => {
    const { deps } = fakeDocker([
      net("it_ai_search_backend"),
      net("flisk_doctor_probe_111"),
      net("bridge"),
    ]);
    const plan = await planDoctorFixes("it-ai-search", deps);
    expect(plan.map((a) => [a.id, a.scope, a.status])).toEqual([
      ["remove-network:it_ai_search_backend", "project", "planned"],
      ["remove-network:flisk_doctor_probe_111", "probe", "planned"],
    ]);
    expect(plan[0]?.command).toBe("docker network rm it_ai_search_backend");
  });

  it("never plans another project's networks", async () => {
    const { deps } = fakeDocker([net("umami_backend"), net("flisk_restaurant_example_database")]);
    expect(await planDoctorFixes("it-ai-search", deps)).toEqual([]);
  });

  it("skips project networks while Tilt runs, but still plans probes", async () => {
    const { deps } = fakeDocker([net("it_ai_search_backend"), net("flisk_doctor_probe_5")]);
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
    const { deps } = fakeDocker([net("flisk_doctor_probe_42"), net("flisk_doctor_probe_43")], [42]);
    const plan = await planDoctorFixes(undefined, deps);
    expect(plan.map((a) => a.status)).toEqual(["skipped", "planned"]);
  });

  it("only plans probes outside a project", async () => {
    const { deps } = fakeDocker([net("it_ai_search_backend"), net("flisk_doctor_probe_7")]);
    const plan = await planDoctorFixes(undefined, deps);
    expect(plan.map((a) => a.id)).toEqual(["remove-network:flisk_doctor_probe_7"]);
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
      freeDiskGib: () => 100,
      reclaimable: async () => ({ buildCache: null, danglingImages: 0 }),
      prune: async () => {},
      trimColima: async () => {},
      colima: async () => {},
      colimaStatus: () => ({ isColima: false, running: true }),
      dockerAnswers: () => true,
    };
    await applyDoctorFixes(
      await planDoctorFixes("it-ai-search", deps),
      { dryRun: false, confirm: async () => true },
      deps,
    );
    expect(await planDoctorFixes("it-ai-search", deps)).toEqual([]);
  });
});

describe("checkDuplicateFliskInstalls", () => {
  it("passes with zero or one install", async () => {
    expect((await checkDuplicateFliskInstalls([])).didPass).toBe(true);
    const result = await checkDuplicateFliskInstalls([
      { path: "/usr/bin/flisk", version: "1.3.155" },
    ]);
    expect(result.didPass).toBe(true);
  });

  it("warns with both paths and versions when installs differ", async () => {
    const result = await checkDuplicateFliskInstalls([
      { path: "/opt/bin/flisk", version: "1.3.155" },
      { path: "/usr/local/bin/flisk", version: "1.3.144" },
    ]);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("/usr/local/bin/flisk (1.3.144)");
    expect(result.message).toContain("different versions");
  });

  it("warns without mentioning different versions when versions match", async () => {
    const result = await checkDuplicateFliskInstalls([
      { path: "/opt/bin/flisk", version: "1.3.155" },
      { path: "/usr/local/bin/flisk", version: "1.3.155" },
    ]);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).not.toContain("different versions");
    expect(result.message).toContain(
      "2 flisk installs on PATH: /opt/bin/flisk (1.3.155), /usr/local/bin/flisk (1.3.155)",
    );
  });

  it("formats unknown versions gracefully", async () => {
    const result = await checkDuplicateFliskInstalls([
      { path: "/opt/bin/flisk", version: null },
      { path: "/usr/local/bin/flisk", version: "1.3.155" },
    ]);
    expect(result.message).toContain("/opt/bin/flisk (version unknown)");
  });

  it("checks installs using system default when no installs are passed", async () => {
    const result = await checkDuplicateFliskInstalls();
    expect(result.name).toBe("Flisk installs");
    expect(typeof result.didPass).toBe("boolean");
  });
});

describe("findFliskInstalls", () => {
  it("returns empty list for empty path list", async () => {
    expect(await findFliskInstalls([])).toEqual([]);
  });

  it("deduplicates symlinks resolving to the same binary path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "find-flisk-"));
    const bin = join(dir, "flisk-bin");
    const link = join(dir, "flisk-link");
    writeFileSync(bin, "#!/bin/sh\n");
    try {
      symlinkSync(bin, link);
    } catch {
      // Windows without developer mode/symlink privileges falls through gracefully
      return;
    }
    const installs = await findFliskInstalls([link, bin], async () => "1.0.0");
    expect(installs).toEqual([{ path: link, version: "1.0.0" }]);
  });

  it("keeps unresolvable paths and reads their versions", async () => {
    const installs = await findFliskInstalls(
      ["/nonexistent/flisk-a", "/nonexistent/flisk-b"],
      async (p) => (p.endsWith("a") ? "1.0.0" : null),
    );
    expect(installs).toEqual([
      { path: "/nonexistent/flisk-a", version: "1.0.0" },
      { path: "/nonexistent/flisk-b", version: null },
    ]);
  });
});

describe("createDockerFixDeps", () => {
  it("lists networks with their container counts and skips one removed mid-listing", async () => {
    const calls: string[][] = [];
    const deps = createDockerFixDeps(async (args) => {
      calls.push(args);
      if (args[1] === "ls") return "bridge\nit_ai_search_backend\nflisk_doctor_probe_1\n";
      const name = args.at(-1);
      if (name === "flisk_doctor_probe_1") {
        throw new Error("Error response from daemon: network flisk_doctor_probe_1 not found");
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

  it("parses reclaimable build cache and dangling images correctly", async () => {
    const deps = createDockerFixDeps(async (args) => {
      if (args[0] === "system" && args[1] === "df") {
        return "Images\t10GB\nBuild Cache\t1.531GB (39%)\n";
      }
      if (args[0] === "images") {
        return "sha256:abc\nsha256:def\n";
      }
      return "";
    });
    const info = await deps.reclaimable();
    expect(info).toEqual({
      buildCache: "1.531GB",
      danglingImages: 2,
    });
  });

  it("handles reclaimable failures gracefully with defaults", async () => {
    const deps = createDockerFixDeps(async () => {
      throw new Error("docker daemon unresponsive");
    });
    expect(await deps.reclaimable()).toEqual({
      buildCache: null,
      danglingImages: 0,
    });
  });

  it("runs prune for builder and images, formatting errors to first line", async () => {
    const calls: string[][] = [];
    const deps = createDockerFixDeps(async (args) => {
      calls.push(args);
      if (args[0] === "image") {
        throw Object.assign(new Error("fail"), { stderr: "cannot prune images\nline 2" });
      }
      return "";
    });
    await deps.prune("builder");
    expect(calls).toEqual([["builder", "prune", "-f"]]);
    await expect(deps.prune("images")).rejects.toThrow(/^cannot prune images$/);
  });

  it("checks process liveness using process signals", () => {
    const deps = createDockerFixDeps();
    expect(deps.isProcessAlive(process.pid)).toBe(true);
    const child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    if (child.pid) {
      expect(deps.isProcessAlive(child.pid)).toBe(false);
    }
  });

  it("reads free disk GiB safely", () => {
    const deps = createDockerFixDeps();
    const free = deps.freeDiskGib();
    expect(free === null || (typeof free === "number" && free >= 0)).toBe(true);
  });

  it("checks tilt status via tiltStatus safely", async () => {
    const deps = createDockerFixDeps();
    const status = await deps.tiltStatus(process.pid);
    expect(["healthy", "stale", "unknown"]).toContain(status);
  });

  it("sends SIGTERM to the target PID in stopProcess", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      const deps = createDockerFixDeps();
      deps.stopProcess(4321);
      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(4321, "SIGTERM");
    } finally {
      killSpy.mockRestore();
    }
  });
});

describe("dockerFixDeps", () => {
  it("provides the expected default dependency handlers with correct types", () => {
    const expectedKeys = [
      "colima",
      "colimaStatus",
      "dockerAnswers",
      "freeDiskGib",
      "isProcessAlive",
      "listNetworks",
      "prune",
      "reclaimable",
      "removeNetwork",
      "stopProcess",
      "tiltStatus",
      "trimColima",
    ];

    const actualKeys = Object.keys(dockerFixDeps).sort();
    expect(actualKeys).toEqual(expectedKeys.sort());

    for (const key of expectedKeys) {
      expect(typeof dockerFixDeps[key as keyof DoctorFixDeps]).toBe("function");
    }
  });

  it("does not contain duplicate dependency entries in the default dependency list", () => {
    const keys = Object.keys(dockerFixDeps);
    const uniqueKeys = Array.from(new Set(keys));
    expect(keys.length).toBe(uniqueKeys.length);
    expect(keys).toEqual(uniqueKeys);
  });

  it("ensures a dependency already present is not duplicated when merging dependencies", () => {
    const override = {
      dockerAnswers: () => true,
    };
    const combinedDeps: DoctorFixDeps = {
      ...dockerFixDeps,
      ...override,
    };
    const keys = Object.keys(combinedDeps);
    const uniqueKeys = Array.from(new Set(keys));
    expect(keys.length).toBe(uniqueKeys.length);
    expect(keys.filter((k) => k === "dockerAnswers")).toHaveLength(1);
    expect(combinedDeps.dockerAnswers()).toBe(true);
  });

  it("invokes read-only queries safely on the default dependency bundle", () => {
    expect(dockerFixDeps.isProcessAlive(process.pid)).toBe(true);
    const free = dockerFixDeps.freeDiskGib();
    expect(free === null || (typeof free === "number" && free >= 0)).toBe(true);
    expect(typeof dockerFixDeps.dockerAnswers()).toBe("boolean");
    const colima = dockerFixDeps.colimaStatus();
    expect(typeof colima).toBe("object");
    expect(typeof colima.isColima).toBe("boolean");
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
      [join(link, ".flisk", ".flisk-out", "Tiltfile"), [11]],
      [join(real, ".flisk", ".flisk-out", "Tiltfile"), [12]],
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

  it("plans other Flisk projects' unused networks naming the owner", async () => {
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

describe("disk reclaim", () => {
  it("plans nothing while there is plenty of disk or disk is unreadable", async () => {
    const { deps } = fakeDocker([], [], [], {}, { freeGib: 50, buildCache: "3GB", dangling: 4 });
    expect(await planDoctorFixes("p", deps)).toEqual([]);
    const unreadable = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: null, buildCache: "3GB", dangling: 4 },
    );
    expect(await planDoctorFixes("p", unreadable.deps)).toEqual([]);
  });

  it("plans the build cache and untagged images, with sizes, when disk is low", async () => {
    const { deps } = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: 4.2, buildCache: "1.531GB", dangling: 1 },
    );
    const plan = await planDoctorFixes("p", deps);
    expect(plan.map((a) => [a.id, a.scope, a.command])).toEqual([
      ["prune:builder", "host", "docker builder prune -f"],
      ["prune:images", "host", "docker image prune -f"],
    ]);
    expect(plan[0]?.reason).toContain("4.2 GB free; 1.531GB of build cache");
    expect(plan[1]?.reason).toContain("1 untagged image");
  });

  it("plans a trim of the Colima VM after the prunes, so the freed space returns to the Mac", async () => {
    const { deps, colimaState } = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: 3.4, buildCache: "3GB", dangling: 2 },
    );
    colimaState.isColima = true;
    const plan = await planDoctorFixes("p", deps);
    expect(plan.map((a) => a.id)).toEqual(["prune:builder", "prune:images", "trim:colima"]);
    const trim = plan[2];
    expect(trim?.command).toBe("colima ssh -- sudo fstrim -av");
    expect(trim?.scope).toBe("host");
    expect(trim?.reason).toContain("3.4 GB free");
  });

  it("plans the trim even when there is nothing left to prune", async () => {
    const { deps, colimaState } = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: 3.4, buildCache: "0B", dangling: 0 },
    );
    colimaState.isColima = true;
    expect((await planDoctorFixes("p", deps)).map((a) => a.id)).toEqual(["trim:colima"]);
  });

  it("does not plan a trim without Colima, when the VM is stopped, or when disk is not low", async () => {
    const plain = fakeDocker([], [], [], {}, { freeGib: 3.4, buildCache: "3GB", dangling: 0 });
    expect((await planDoctorFixes("p", plain.deps)).map((a) => a.id)).toEqual(["prune:builder"]);

    const stopped = fakeDocker([], [], [], {}, { freeGib: 3.4, buildCache: "3GB", dangling: 0 });
    stopped.colimaState.isColima = true;
    stopped.colimaState.running = false;
    expect((await planDoctorFixes("p", stopped.deps)).some((a) => a.id === "trim:colima")).toBe(
      false,
    );

    const roomy = fakeDocker([], [], [], {}, { freeGib: 100, buildCache: "3GB", dangling: 5 });
    roomy.colimaState.isColima = true;
    expect(await planDoctorFixes("p", roomy.deps)).toEqual([]);
  });

  it("applies the trim once, after the prunes, and reports it", async () => {
    const { deps, pruned, trimmed, colimaState } = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: 3.4, buildCache: "3GB", dangling: 1 },
    );
    colimaState.isColima = true;
    const results = await applyDoctorFixes(
      await planDoctorFixes("p", deps),
      { dryRun: false, confirm: async () => true },
      deps,
    );
    expect(pruned).toEqual(["builder", "images"]);
    expect(trimmed).toEqual(["fstrim"]);
    expect(results.find((a) => a.id === "trim:colima")).toMatchObject({
      status: "applied",
      reason: "trimmed",
    });
  });

  it("reports a failed trim with the command to run by hand, and does not stop the other repairs", async () => {
    const { deps, pruned, colimaState } = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: 3.4, buildCache: "3GB", dangling: 0 },
    );
    colimaState.isColima = true;
    deps.trimColima = async () => {
      throw new Error("sudo: a password is required");
    };
    const results = await applyDoctorFixes(
      await planDoctorFixes("p", deps),
      { dryRun: false, confirm: async () => true },
      deps,
    );
    expect(pruned).toEqual(["builder"]);
    const trim = results.find((a) => a.id === "trim:colima");
    expect(trim?.status).toBe("failed");
    expect(trim?.reason).toContain("sudo: a password is required");
  });

  it("skips what has nothing to reclaim, and never plans volumes or a full image prune", async () => {
    const { deps } = fakeDocker([], [], [], {}, { freeGib: 1, buildCache: "0B", dangling: 0 });
    expect(await planDoctorFixes("p", deps)).toEqual([]);
    const full = fakeDocker([], [], [], {}, { freeGib: 1, buildCache: "2GB", dangling: 2 });
    const commands = (await planDoctorFixes("p", full.deps)).map((a) => a.command).join(" ");
    expect(commands).not.toMatch(/volume|-a\b/);
  });

  it("prunes only after confirmation", async () => {
    const { deps, pruned } = fakeDocker(
      [],
      [],
      [],
      {},
      { freeGib: 3, buildCache: "1GB", dangling: 1 },
    );
    const plan = await planDoctorFixes("p", deps);
    await applyDoctorFixes(plan, { dryRun: false, confirm: async () => false }, deps);
    expect(pruned).toEqual([]);
    const result = await applyDoctorFixes(plan, { dryRun: false, confirm: async () => true }, deps);
    expect(pruned).toEqual(["builder", "images"]);
    expect(result.every((a) => a.status === "applied")).toBe(true);
  });

  it("records failed status when prune throws", async () => {
    const { deps } = fakeDocker([], [], [], {}, { freeGib: 3, buildCache: "1GB", dangling: 0 });
    deps.prune = async () => {
      throw new Error("prune error details");
    };
    const plan = await planDoctorFixes("p", deps);
    const result = await applyDoctorFixes(plan, { dryRun: false, confirm: async () => true }, deps);
    expect(result[0]?.status).toBe("failed");
    expect(result[0]?.reason).toBe("Error: prune error details");
  });

  it("records failed status when stopProcess throws", async () => {
    const { deps } = fakeDocker([], [], [], { 99: "stale" });
    deps.stopProcess = () => {
      throw new Error("permission denied");
    };
    const plan = await planDoctorFixes("p", deps, { tiltPids: [99] });
    const result = await applyDoctorFixes(plan, { dryRun: false, confirm: async () => true }, deps);
    expect(result[0]?.status).toBe("failed");
    expect(result[0]?.reason).toBe("Error: permission denied");
  });
});

describe("anyTiltAnswers", () => {
  const noWait = async () => {};

  it("is healthy when one port answers", async () => {
    const probe = async (port: number) => (port === 10350 ? "{}" : null);
    expect(await anyTiltAnswers([9999, 10350], probe, 2, noWait)).toBe(true);
  });

  it("retries once, so a single missed request does not look stale", async () => {
    let calls = 0;
    const probe = async () => (++calls === 1 ? null : "{}");
    expect(await anyTiltAnswers([10350], probe, 2, noWait)).toBe(true);
    expect(calls).toBe(2);
  });

  it("is silent only when every port misses every attempt", async () => {
    let calls = 0;
    const probe = async () => {
      calls++;
      return null;
    };
    expect(await anyTiltAnswers([1, 2], probe, 2, noWait)).toBe(false);
    expect(calls).toBe(4);
    expect(await anyTiltAnswers([], probe, 2, noWait)).toBe(false);
  });
});

describe("Colima repairs", () => {
  const baseDeps = (overrides: Partial<DoctorFixDeps> = {}): DoctorFixDeps => ({
    listNetworks: async () => [],
    removeNetwork: async () => {},
    isProcessAlive: () => false,
    tiltStatus: async () => "unknown",
    stopProcess: () => {},
    freeDiskGib: () => 100,
    reclaimable: async () => ({ buildCache: null, danglingImages: 0 }),
    prune: async () => {},
    trimColima: async () => {},
    colima: async () => {},
    colimaStatus: () => ({ isColima: true, running: false }),
    dockerAnswers: () => false,
    ...overrides,
  });

  it("plans a start when the Colima VM is not running", async () => {
    const actions = await planDoctorFixes("shop", baseDeps());
    const start = actions.find((action) => action.id === "colima:start");
    expect(start?.command).toBe("colima start");
    expect(start?.status).toBe("planned");
  });

  it("plans a restart when the VM is up but Docker does not answer", async () => {
    const actions = await planDoctorFixes(
      "shop",
      baseDeps({ colimaStatus: () => ({ isColima: true, running: true }) }),
    );
    expect(actions.find((action) => action.id === "colima:restart")?.command).toBe(
      "colima restart",
    );
  });

  it("plans nothing when Colima is healthy", async () => {
    const actions = await planDoctorFixes(
      "shop",
      baseDeps({
        colimaStatus: () => ({ isColima: true, running: true, arch: "aarch64" }),
        dockerAnswers: () => true,
      }),
    );
    expect(actions.filter((action) => action.id.startsWith("colima:"))).toEqual([]);
  });

  it("applies the start", async () => {
    const ran: string[] = [];
    const deps = baseDeps({
      colima: async (action) => {
        ran.push(action);
      },
    });
    const results = await applyDoctorFixes(
      await planDoctorFixes("shop", deps),
      { dryRun: false, confirm: async () => true },
      deps,
    );
    expect(ran).toEqual(["start"]);
    expect(results.find((action) => action.id === "colima:start")?.status).toBe("applied");
  });

  it("plans and applies native-lima repair and records failure when native-lima throws", async () => {
    const ran: string[] = [];
    const deps = baseDeps({
      colimaStatus: () => ({
        isColima: true,
        running: false,
        problem: "Lima is installed as an x86_64 build",
      }),
      colima: async (action) => {
        ran.push(action);
      },
    });
    const plan = await planDoctorFixes("shop", deps);
    expect(plan.find((action) => action.id === "colima:native-lima")?.status).toBe("planned");
    const applied = await applyDoctorFixes(
      plan,
      { dryRun: false, confirm: async () => true },
      deps,
    );
    expect(ran).toEqual(["native-lima"]);
    expect(applied[0]?.status).toBe("applied");
    expect(applied[0]?.reason).toBe("native lima repaired and colima started");

    const failingDeps = baseDeps({
      colimaStatus: () => ({
        isColima: true,
        running: false,
        problem: "Lima is installed as an x86_64 build",
      }),
      colima: async () => {
        throw new Error("brew reinstall lima failed");
      },
    });
    const failed = await applyDoctorFixes(
      plan,
      { dryRun: false, confirm: async () => true },
      failingDeps,
    );
    expect(failed[0]?.status).toBe("failed");
    expect(failed[0]?.reason).toBe("Error: brew reinstall lima failed");
  });
});

describe("runColima", () => {
  it("runs colima start with native limactl prepended to PATH when present", async () => {
    const calls: Array<{ file: string; args: string[]; path?: string }> = [];
    await runColima(
      "start",
      async (file, args, options) => {
        calls.push({ file, args, path: options.env?.PATH });
      },
      () => "/opt/homebrew/bin",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe("colima");
    expect(calls[0]?.args).toEqual(["start"]);
    expect(calls[0]?.path?.startsWith("/opt/homebrew/bin:")).toBe(true);
  });

  it("runs colima restart without modifying PATH when no native limactl is found", async () => {
    const calls: Array<{ file: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    await runColima(
      "restart",
      async (file, args, options) => {
        calls.push({ file, args, env: options.env });
      },
      () => null,
    );
    expect(calls).toEqual([{ file: "colima", args: ["restart"], env: process.env }]);
  });

  it("starts colima directly for native-lima when a native limactl is already installed", async () => {
    const calls: Array<{ file: string; args: string[]; path?: string }> = [];
    await runColima(
      "native-lima",
      async (file, args, options) => {
        calls.push({ file, args, path: options.env?.PATH });
      },
      () => "/opt/homebrew/bin",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe("colima");
    expect(calls[0]?.args).toEqual(["start"]);
    expect(calls[0]?.path?.startsWith("/opt/homebrew/bin:")).toBe(true);
  });

  it("reinstalls lima via homebrew and starts colima when native-lima initially lacks native limactl", async () => {
    const calls: Array<{ file: string; args: string[]; path?: string }> = [];
    let checks = 0;
    await runColima(
      "native-lima",
      async (file, args, options) => {
        calls.push({ file, args, path: options.env?.PATH });
      },
      () => (checks++ === 0 ? null : "/opt/homebrew/bin"),
      (path) => path === "/opt/homebrew/bin/brew",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]?.file).toBe("/opt/homebrew/bin/brew");
    expect(calls[0]?.args).toEqual(["reinstall", "lima"]);
    expect(calls[1]?.file).toBe("colima");
    expect(calls[1]?.args).toEqual(["start"]);
    expect(calls[1]?.path?.startsWith("/opt/homebrew/bin:")).toBe(true);
  });

  it("throws FliskError when brew reinstall lima still does not provide a native limactl", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    await expect(
      runColima(
        "native-lima",
        async (file, args) => {
          calls.push({ file, args });
        },
        () => null,
        () => false,
      ),
    ).rejects.toThrow("brew reinstall lima did not provide a native limactl");
    expect(calls).toEqual([{ file: "brew", args: ["reinstall", "lima"] }]);
  });
});
