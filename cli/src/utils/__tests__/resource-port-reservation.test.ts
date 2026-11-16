// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readAssignedPorts,
  reserveResourcePort,
  resourcePortReservation,
} from "../resource-port-reservation.js";

const RANGE = { max: 4999 };

describe("reserveResourcePort (#4023)", () => {
  let projectRoot: string;
  let claimDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-port-reservation-"));
    claimDir = join(projectRoot, "claims");
    mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
    writeFileSync(join(projectRoot, ".flisk", "project.json"), "{}\n");
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  const writeService = (name: string, port: number): void => {
    const dir = join(projectRoot, "services", "shop", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "service.json"),
      JSON.stringify({ appName: name, appType: "backend", stack: "shop", port }),
    );
  };

  // Each create is its own reservation, as two `flisk resource` processes or two MCP calls are.
  const reservation = (owner: string, alive = () => true) =>
    resourcePortReservation(projectRoot, { owner, dir: claimDir, isProcessAlive: alive });

  it("gives two creates that picked the same port from the same snapshot different ports", async () => {
    const first = await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("a"));
    const second = await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("b"));

    expect(first.port).toBe(4000);
    expect(second.port).toBe(4001);
  });

  it("hands out unique ports to many creates started together", async () => {
    const ports = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation(`c${index}`)).then(
          (reserved) => reserved.port,
        ),
      ),
    );
    expect(new Set(ports).size).toBe(8);
  });

  it("skips a port that another create wrote to service.json after this one scanned", async () => {
    const first = await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("a"));
    writeService("written", first.port);
    first.release();

    const second = await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("b"));
    expect(second.port).toBe(4001);
  });

  it("refuses an explicit --port that another create holds or already wrote", async () => {
    await reserveResourcePort(4100, { explicit: true, ...RANGE }, reservation("a"));
    await expect(
      reserveResourcePort(4100, { explicit: true, ...RANGE }, reservation("b")),
    ).rejects.toThrow("Port 4100 is already assigned to another resource.");

    writeService("taken", 4200);
    await expect(
      reserveResourcePort(4200, { explicit: true, ...RANGE }, reservation("c")),
    ).rejects.toThrow("Port 4200 is already assigned to another resource.");
  });

  it("frees the port on release, and a crashed create does not block it", async () => {
    const first = await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("a"));
    first.release();
    const again = await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("b"));
    expect(again.port).toBe(4000);

    // "b" never released, but its process is gone.
    const afterCrash = await reserveResourcePort(
      4000,
      { explicit: false, ...RANGE },
      resourcePortReservation(projectRoot, {
        owner: "c",
        dir: claimDir,
        isProcessAlive: () => false,
      }),
    );
    expect(afterCrash.port).toBe(4000);
  });

  it("checks a moved-to port with the extra test, e.g. nothing listens on it for --local", async () => {
    await reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("a"));
    const reserved = await reserveResourcePort(
      4000,
      { explicit: false, ...RANGE, isFree: async (port) => port !== 4001 },
      reservation("b"),
    );
    expect(reserved.port).toBe(4002);
  });

  it("ignores the manifest of the resource being registered", () => {
    writeService("self", 4300);
    writeService("other", 4301);
    const self = join(projectRoot, "services", "shop", "self", "service.json");

    expect([...readAssignedPorts(projectRoot)].sort()).toEqual([4300, 4301]);
    expect([...readAssignedPorts(projectRoot, self)]).toEqual([4301]);
  });

  it("refuses creation when the claim storage cannot be written", async () => {
    writeFileSync(claimDir, "not a directory");
    await expect(
      reserveResourcePort(4000, { explicit: false, ...RANGE }, reservation("a")),
    ).rejects.toThrow("Cannot reserve a resource port");
  });

  it("does not replace a claim while another writer holds its guard", async () => {
    mkdirSync(join(claimDir, "4000.guard"), { recursive: true });
    const reserved = await reserveResourcePort(
      4000,
      { explicit: false, ...RANGE },
      reservation("a"),
    );
    expect(reserved.port).toBe(4001);
  });

  it("releases a claim if checking assigned ports throws", async () => {
    const held = new Set<number>();
    await expect(
      reserveResourcePort(
        4000,
        { explicit: false, ...RANGE },
        {
          claim: (port) => {
            held.add(port);
            return true;
          },
          release: (port) => {
            held.delete(port);
          },
          assignedPorts: () => {
            throw new Error("scan failed");
          },
        },
      ),
    ).rejects.toThrow("scan failed");
    expect(held.size).toBe(0);
  });
});
