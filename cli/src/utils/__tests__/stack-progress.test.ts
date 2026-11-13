// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";

import { formatProgress, readStackProgress, type StackProgress } from "../stack-progress.js";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: execFileMock,
}));

/** Makes the mocked `tilt get uiresources` answer with the given output. */
function tiltAnswers(output: string, error: Error | null = null): void {
  execFileMock.mockImplementation(((
    _bin: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(error, output, "");
    return undefined;
  }) as never);
}

describe("readStackProgress", () => {
  it("is undefined when tilt cannot be run", async () => {
    tiltAnswers("", new Error("tilt: not found"));
    expect(await readStackProgress(10350)).toBeUndefined();
  });

  it("is undefined when the output is not JSON", async () => {
    tiltAnswers("not json at all");
    expect(await readStackProgress(10350)).toBeUndefined();
  });

  it("is empty when tilt reports no resources", async () => {
    tiltAnswers(JSON.stringify({}));
    expect(await readStackProgress(10350)).toEqual({
      ready: 0,
      building: 0,
      pending: 0,
      failed: 0,
      total: 0,
      working: [],
      broken: [],
    });
  });

  it("asks tilt for the resources on the given port", async () => {
    tiltAnswers(JSON.stringify({ items: [] }));
    await readStackProgress(10351);
    expect(execFileMock).toHaveBeenCalledWith(
      "tilt",
      ["get", "uiresources", "-o", "json", "--port", "10351"],
      expect.objectContaining({ timeout: 15_000 }),
      expect.any(Function),
    );
  });

  it("counts the resources by state", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [
          { metadata: { name: "orders-api" }, status: { updateStatus: "ok", runtimeStatus: "ok" } },
          {
            metadata: { name: "orders-app" },
            status: { updateStatus: "ok", runtimeStatus: "not_applicable" },
          },
          { metadata: { name: "orders-worker" }, status: { updateStatus: "pending" } },
          { metadata: { name: "migrate" }, status: { updateStatus: "in_progress" } },
          { metadata: { name: "broken" }, status: { updateStatus: "error" } },
        ],
      }),
    );

    const progress = await readStackProgress(10350);
    expect(progress).toMatchObject({ ready: 2, building: 1, pending: 1, failed: 1, total: 5 });
    expect(progress?.working).toEqual([
      { name: "orders-worker", state: "pending" },
      { name: "migrate", state: "in_progress" },
    ]);
    expect(progress?.broken).toHaveLength(1);
    expect(progress?.broken[0].name).toBe("broken");
  });

  it("counts a resource that is not built yet as queued, whatever it is already running", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [
          {
            metadata: { name: "orders-api" },
            status: { updateStatus: "pending", runtimeStatus: "ok" },
          },
        ],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress).toMatchObject({ ready: 0, building: 0, pending: 1, failed: 0, total: 1 });
    expect(progress?.working).toEqual([{ name: "orders-api", state: "ok" }]);
  });

  it("counts a resource that is still being built as building", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [{ metadata: { name: "migrate" }, status: { updateStatus: "in_progress" } }],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress).toMatchObject({ ready: 0, building: 1, pending: 0, failed: 0, total: 1 });
    expect(progress?.working).toEqual([{ name: "migrate", state: "in_progress" }]);
  });

  it("counts a runtime error as a failure", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [
          {
            metadata: { name: "orders-api" },
            status: { updateStatus: "ok", runtimeStatus: "error" },
          },
        ],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress).toMatchObject({ failed: 1, ready: 0 });
  });

  it("names a resource without metadata unknown", async () => {
    tiltAnswers(
      JSON.stringify({ items: [{ status: { updateStatus: "ok", runtimeStatus: "ok" } }] }),
    );
    const progress = await readStackProgress(10350);
    expect(progress?.ready).toBe(1);
  });

  it("reports the build error of a failed resource", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [
          {
            metadata: { name: "orders-api" },
            status: {
              updateStatus: "error",
              buildHistory: [{ error: "the   build\nfailed" }],
            },
          },
        ],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress?.broken[0].message).toBe("the build failed");
  });

  it("falls back to a generic message when there is no build error", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [{ metadata: { name: "orders-api" }, status: { updateStatus: "error" } }],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress?.broken[0].message).toBe("the resource failed");
  });

  it("shortens a long build error", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [
          {
            metadata: { name: "orders-api" },
            status: { updateStatus: "error", buildHistory: [{ error: "x".repeat(300) }] },
          },
        ],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress?.broken[0].message).toHaveLength(160);
  });
});

/** One UIResource row as `tilt get uiresources -o json` returns it. */
function row(name: string, updateStatus: string, runtimeStatus: string) {
  return { metadata: { name }, status: { updateStatus, runtimeStatus } };
}

/** The 32 UIResources of the 7-service demo, shaped like the Tilt snapshot in issue #4120. */
function demoResources() {
  const services = [
    "restaurant-migrator",
    "menu-api",
    "orders-api",
    "kitchen-worker",
    "floor-app",
    "host-app",
    "admin-app",
  ];
  const items = [
    row("(Tiltfile)", "ok", "not_applicable"),
    row("init-networks", "ok", "not_applicable"),
    row("golden-layers-build", "ok", "not_applicable"),
    row("service-discovery-daemon", "none", "none"),
    row("postgres", "ok", "ok"),
    row("traefik", "ok", "ok"),
    row("provision-db-restaurant-migrator", "ok", "not_applicable"),
    row("provision-db-menu-api", "ok", "not_applicable"),
    // The only build in progress.
    row("restaurant-migrator", "in_progress", "pending"),
    row("menu-api", "pending", "pending"),
    row("orders-api", "ok", "ok"),
    row("kitchen-worker", "ok", "ok"),
    row("floor-app", "ok", "ok"),
    row("host-app", "ok", "ok"),
    row("admin-app", "ok", "ok"),
  ];
  for (const name of services) items.push(row(`${name}-yaml`, "none", "none"));
  for (const name of services.slice(0, 5)) items.push(row(`${name}-run-only`, "none", "none"));
  for (const name of services.slice(0, 5))
    items.push(row(`${name}-typecheck`, "ok", "not_applicable"));
  return items;
}

describe("readStackProgress on the demo's real resource list", () => {
  it("counts the user's services plus Postgres and Traefik, not the Tilt helpers", async () => {
    const items = demoResources();
    expect(items).toHaveLength(32);
    tiltAnswers(JSON.stringify({ items }));
    const progress = await readStackProgress(10350);
    expect(progress?.total).toBe(9);
    expect(progress?.building).toBe(1);
    expect(progress?.ready).toBe(7);
    expect(progress?.pending).toBe(1);
    expect(progress?.working.map((w) => w.name)).toEqual(["restaurant-migrator", "menu-api"]);
  });

  it("never counts a resource whose updateStatus is none as building", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [row("orders-api", "none", "none"), row("orders-web", "none", "ok")],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress?.building).toBe(0);
    expect(progress).toMatchObject({ ready: 1, pending: 1, total: 2 });
  });

  it("keeps the total the same from the first frame to the last", async () => {
    const items = demoResources();
    tiltAnswers(JSON.stringify({ items }));
    const first = await readStackProgress(10350);
    const done = items.map((item) =>
      item.status.updateStatus === "none" ? item : row(item.metadata.name, "ok", "ok"),
    );
    tiltAnswers(JSON.stringify({ items: done }));
    const last = await readStackProgress(10350);
    expect(last?.total).toBe(first?.total);
    expect(last).toMatchObject({ ready: 9, building: 0, pending: 0 });
  });

  it("labels the infrastructure steps as their own phase", async () => {
    tiltAnswers(
      JSON.stringify({
        items: [
          row("golden-layers-build", "in_progress", "not_applicable"),
          row("provision-db-menu-api", "pending", "not_applicable"),
          row("menu-api", "pending", "pending"),
        ],
      }),
    );
    const progress = await readStackProgress(10350);
    expect(progress?.infraPhase).toBe("Building base images");
    expect(progress).toMatchObject({ total: 1, building: 0, pending: 1 });
  });

  it("still reports a failed infrastructure step", async () => {
    tiltAnswers(JSON.stringify({ items: [row("golden-layers-build", "error", "not_applicable")] }));
    const progress = await readStackProgress(10350);
    expect(progress).toMatchObject({ failed: 1, total: 0 });
    expect(progress?.broken[0].name).toBe("golden-layers-build");
  });
});

describe("formatProgress", () => {
  const base: StackProgress = {
    ready: 3,
    building: 2,
    pending: 4,
    failed: 0,
    total: 9,
    working: [],
    broken: [],
    elapsed: 75,
  };

  it("counts what is ready, building, queued and failed", () => {
    const line = formatProgress(base);
    expect(line).toContain("3/9 resources ready");
    expect(line).toContain("1m 15s");
    expect(line).toContain("2 building");
    expect(line).toContain("4 queued");
  });

  it("mentions the failures", () => {
    expect(formatProgress({ ...base, failed: 1 })).toContain("1 failed");
  });

  it("shows seconds before the first minute", () => {
    expect(formatProgress({ ...base, elapsed: 8 })).toContain("8s");
  });

  it("leaves out the counters that are zero", () => {
    const line = formatProgress({ ...base, building: 0, pending: 0, failed: 0 });
    expect(line).not.toContain("building");
    expect(line).not.toContain("queued");
    expect(line).not.toContain("failed");
  });
});
