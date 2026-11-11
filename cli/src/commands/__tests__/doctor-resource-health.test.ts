// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { checkContainerResourceHealthFor } from "../doctor.js";

const PS = (rows: Array<[string, string]>) => rows.map(([id, p]) => `${id}\t${p}`).join("\n");

describe("checkContainerResourceHealthFor", () => {
  it("skips without calling docker stats when no running container belongs to the project", async () => {
    const run = vi.fn(async (_args: string[]) => PS([["abc", "other_project"]]));
    const result = await checkContainerResourceHealthFor("my-app", run);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toBe("No running containers to check");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls.some(([args]) => (args as string[])[0] === "stats")).toBe(false);
  });

  it("samples only the project's containers", async () => {
    const run = vi.fn(async (args: string[]) =>
      args[0] === "ps"
        ? PS([
            ["c1", "my_app"],
            ["c2", "elsewhere"],
            ["c3", "my-app"],
          ])
        : "my_app-web,10.00%,5.00%\nmy_app-db,20.00%,1.00%\n",
    );
    const result = await checkContainerResourceHealthFor("my-app", run);
    const statsArgs = run.mock.calls.map(([a]) => a).find((a) => a[0] === "stats") as string[];
    expect(statsArgs.slice(-2)).toEqual(["c1", "c3"]);
    expect(statsArgs).not.toContain("c2");
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("2 containers");
  });

  it("flags a project container pinned near its memory limit while burning CPU", async () => {
    const run = async (args: string[]) =>
      args[0] === "ps" ? PS([["c1", "my_app"]]) : "my_app-api,99.00%,120.00%\n";
    const result = await checkContainerResourceHealthFor("my-app", run);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("my_app-api");
  });

  it("skips when docker is not running", async () => {
    const result = await checkContainerResourceHealthFor("my-app", async () => {
      throw new Error("Cannot connect to the Docker daemon");
    });
    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("Docker not running");
  });
});
