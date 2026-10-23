// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { singleFlight } from "../single-flight.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("applies the result of a load", async () => {
    const applied: string[] = [];
    const run = singleFlight<string>((value) => applied.push(value));
    await run(async () => "a");
    expect(applied).toEqual(["a"]);
  });

  it("starts nothing while a load is still running", async () => {
    const applied: string[] = [];
    let started = 0;
    const run = singleFlight<string>((value) => applied.push(value));
    const slow = deferred<string>();

    const first = run(() => {
      started += 1;
      return slow.promise;
    });
    await run(async () => {
      started += 1;
      return "skipped";
    });
    slow.resolve("slow result");
    await first;

    expect(started).toBe(1);
    expect(applied).toEqual(["slow result"]);
  });

  it("deduplicates multiple concurrent callers so only the in-flight caller runs", async () => {
    const applied: number[] = [];
    let loadCount = 0;
    const run = singleFlight<number>((value) => applied.push(value));
    const slow = deferred<number>();

    const p1 = run(() => {
      loadCount += 1;
      return slow.promise;
    });
    const p2 = run(async () => {
      loadCount += 1;
      return 2;
    });
    const p3 = run(async () => {
      loadCount += 1;
      return 3;
    });
    const p4 = run(async () => {
      loadCount += 1;
      return 4;
    });

    slow.resolve(100);
    await Promise.all([p1, p2, p3, p4]);

    expect(loadCount).toBe(1);
    expect(applied).toEqual([100]);
  });

  it("still updates when every load outlasts the timer tick", async () => {
    const applied: number[] = [];
    const run = singleFlight<number>((value) => applied.push(value));
    const loads = [deferred<number>(), deferred<number>(), deferred<number>()];
    let next = 0;
    const tick = () => run(() => loads[next++]?.promise ?? Promise.resolve(-1));

    const a = tick(); // starts load 0
    void tick(); // tick while load 0 runs: skipped
    loads[0]?.resolve(10);
    await a;
    const b = tick(); // starts load 1
    void tick(); // skipped
    loads[1]?.resolve(20);
    await b;

    expect(applied).toEqual([10, 20]);
  });

  it("allows the next load after one fails", async () => {
    const applied: string[] = [];
    const run = singleFlight<string>((value) => applied.push(value));
    const failing = deferred<string>();

    const first = run(() => failing.promise);
    failing.reject(new Error("tilt exploded"));
    await expect(first).rejects.toThrow("tilt exploded");
    await run(async () => "recovered");

    expect(applied).toEqual(["recovered"]);
  });

  it("resets running state even when apply callback throws an error", async () => {
    let shouldThrow = true;
    const applied: number[] = [];
    const run = singleFlight<number>((value) => {
      if (shouldThrow) {
        throw new Error("apply failed");
      }
      applied.push(value);
    });

    await expect(run(async () => 42)).rejects.toThrow("apply failed");

    shouldThrow = false;
    await run(async () => 99);
    expect(applied).toEqual([99]);
  });

  it("correctly handles falsy values produced by load", async () => {
    const applied: unknown[] = [];
    const run = singleFlight<unknown>((value) => applied.push(value));

    await run(async () => 0);
    await run(async () => false);
    await run(async () => "");
    await run(async () => null);

    expect(applied).toEqual([0, false, "", null]);
  });
});
