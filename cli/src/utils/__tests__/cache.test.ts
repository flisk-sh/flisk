// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { Cache, createCacheValidator } from "../cache.js";

describe("Cache", () => {
  it("should store and retrieve values", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("should return undefined for missing keys", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("should report has() correctly", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    cache.set("key1", "value1");
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("nonexistent")).toBe(false);
  });

  it("should correctly store and retrieve falsy values", () => {
    const cache = new Cache<unknown>({ ttlMs: 5000 });
    cache.set("zero", 0);
    cache.set("empty", "");
    cache.set("falsy", false);
    cache.set("nullable", null);

    expect(cache.has("zero")).toBe(true);
    expect(cache.get("zero")).toBe(0);

    expect(cache.has("empty")).toBe(true);
    expect(cache.get("empty")).toBe("");

    expect(cache.has("falsy")).toBe(true);
    expect(cache.get("falsy")).toBe(false);

    expect(cache.has("nullable")).toBe(true);
    expect(cache.get("nullable")).toBeNull();
  });

  it("should overwrite existing keys and update their value", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    cache.set("k", "initial");
    expect(cache.get("k")).toBe("initial");

    cache.set("k", "updated");
    expect(cache.get("k")).toBe("updated");
    expect(cache.size()).toBe(1);
  });

  it("should delete values", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    cache.set("key1", "value1");
    cache.delete("key1");
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.has("key1")).toBe(false);
  });

  it("should safely handle deleting non-existent keys", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    expect(() => cache.delete("nonexistent")).not.toThrow();
  });

  it("should clear all values", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.keys()).toEqual([]);
  });

  it("should expire entries after TTL", async () => {
    const cache = new Cache<string>({ ttlMs: 10 });
    cache.set("key1", "value1");
    expect(cache.has("key1")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.has("key1")).toBe(false);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("should return correct size", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    expect(cache.size()).toBe(0);
    cache.set("a", "1");
    expect(cache.size()).toBe(1);
    cache.set("b", "2");
    expect(cache.size()).toBe(2);
  });

  it("should return all valid keys", () => {
    const cache = new Cache<string>({ ttlMs: 5000 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.keys().sort()).toEqual(["a", "b", "c"]);
  });

  it("should not include expired keys in keys() or size()", async () => {
    const cache = new Cache<string>({ ttlMs: 15 });
    cache.set("a", "1");
    cache.set("b", "2");
    await new Promise((resolve) => setTimeout(resolve, 25));
    cache.set("c", "3");

    expect(cache.keys()).toEqual(["c"]);
    expect(cache.size()).toBe(1);
  });
});

describe("createCacheValidator", () => {
  it("should start as invalid", () => {
    const validator = createCacheValidator(1000);
    expect(validator.isValid()).toBe(false);
  });

  it("should be valid after markUpdated", () => {
    const validator = createCacheValidator(1000);
    validator.markUpdated();
    expect(validator.isValid()).toBe(true);
  });

  it("should refresh validity on repeated markUpdated calls", async () => {
    const validator = createCacheValidator(200);
    validator.markUpdated();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(validator.isValid()).toBe(true);

    validator.markUpdated();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(validator.isValid()).toBe(true);
  });

  it("should expire after TTL", async () => {
    const validator = createCacheValidator(10);
    validator.markUpdated();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(validator.isValid()).toBe(false);
  });

  it("should reset to invalid", () => {
    const validator = createCacheValidator(1000);
    validator.markUpdated();
    validator.reset();
    expect(validator.isValid()).toBe(false);
  });
});
