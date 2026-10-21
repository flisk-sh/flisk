// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { CacheEntry, CacheOptions } from "../types/index.js";

export class Cache<T> {
  private data: Map<string, CacheEntry<T>>;
  private options: CacheOptions;

  constructor(options: CacheOptions) {
    this.data = new Map();
    this.options = options;
  }

  has(key: string): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;

    const isExpired = Date.now() - entry.timestamp > this.options.ttlMs;
    if (isExpired) {
      this.data.delete(key);
      return false;
    }

    return true;
  }

  get(key: string): T | undefined {
    if (!this.has(key)) {
      return undefined;
    }
    return this.data.get(key)?.value;
  }

  set(key: string, value: T): void {
    this.data.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  keys(): string[] {
    const validKeys: string[] = [];
    for (const key of this.data.keys()) {
      if (this.has(key)) {
        validKeys.push(key);
      }
    }
    return validKeys;
  }

  size(): number {
    return this.keys().length;
  }
}

export function createCacheValidator(ttlMs: number) {
  let lastUpdated = 0;

  return {
    isValid(): boolean {
      return Date.now() - lastUpdated < ttlMs;
    },
    markUpdated(): void {
      lastUpdated = Date.now();
    },
    reset(): void {
      lastUpdated = 0;
    },
  };
}
