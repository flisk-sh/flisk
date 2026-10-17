// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { copyToClipboard, isValidHttpUrl, openUrl, type SpawnFunction } from "../url-actions.js";

describe("url-actions", () => {
  describe("isValidHttpUrl", () => {
    it("accepts valid http and https URLs", () => {
      expect(isValidHttpUrl("http://localhost:3000")).toBe(true);
      expect(isValidHttpUrl("https://api.example.com/health")).toBe(true);
      expect(isValidHttpUrl("http://app.myproject.localhost")).toBe(true);
    });

    it("rejects non-http protocols and malformed strings", () => {
      expect(isValidHttpUrl("ftp://example.com")).toBe(false);
      expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
      expect(isValidHttpUrl("not-a-url")).toBe(false);
      expect(isValidHttpUrl("")).toBe(false);
    });
  });

  describe("openUrl", () => {
    it("returns false for invalid URLs without spawning", async () => {
      const mockSpawn = vi.fn();
      expect(await openUrl("invalid-url", "linux", mockSpawn as unknown as SpawnFunction)).toBe(
        false,
      );
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("spawns open on macOS (darwin)", async () => {
      const mockChild = Object.assign(new EventEmitter(), {
        unref: vi.fn(),
      });
      const mockSpawn = vi.fn().mockImplementation(() => {
        process.nextTick(() => mockChild.emit("spawn"));
        return mockChild;
      });

      const result = await openUrl(
        "http://localhost:3000",
        "darwin",
        mockSpawn as unknown as SpawnFunction,
      );

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith("open", ["http://localhost:3000"], expect.anything());
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it("spawns rundll32.exe on Windows (win32)", async () => {
      const mockChild = Object.assign(new EventEmitter(), {
        unref: vi.fn(),
      });
      const mockSpawn = vi.fn().mockImplementation(() => {
        process.nextTick(() => mockChild.emit("spawn"));
        return mockChild;
      });

      const result = await openUrl(
        "http://localhost:3000",
        "win32",
        mockSpawn as unknown as SpawnFunction,
      );

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        "rundll32.exe",
        ["url.dll,FileProtocolHandler", "http://localhost:3000"],
        expect.objectContaining({ windowsHide: true }),
      );
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it("spawns xdg-open on Linux", async () => {
      const mockChild = Object.assign(new EventEmitter(), {
        unref: vi.fn(),
      });
      const mockSpawn = vi.fn().mockImplementation(() => {
        process.nextTick(() => mockChild.emit("spawn"));
        return mockChild;
      });

      const result = await openUrl(
        "http://localhost:3000",
        "linux",
        mockSpawn as unknown as SpawnFunction,
      );

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        "xdg-open",
        ["http://localhost:3000"],
        expect.anything(),
      );
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it("returns false if child emits error", async () => {
      const mockChild = Object.assign(new EventEmitter(), {
        unref: vi.fn(),
      });
      const mockSpawn = vi.fn().mockImplementation(() => {
        process.nextTick(() => mockChild.emit("error", new Error("ENOENT")));
        return mockChild;
      });

      const result = await openUrl(
        "http://localhost:3000",
        "linux",
        mockSpawn as unknown as SpawnFunction,
      );
      expect(result).toBe(false);
    });

    it("returns false if spawn throws synchronously", async () => {
      const mockSpawn = vi.fn().mockImplementation(() => {
        throw new Error("spawn ENOENT");
      });

      const result = await openUrl(
        "http://localhost:3000",
        "linux",
        mockSpawn as unknown as SpawnFunction,
      );
      expect(result).toBe(false);
    });
  });

  describe("copyToClipboard", () => {
    it("spawns pbcopy on darwin and writes to stdin", async () => {
      const mockStdin = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      });
      const mockChild = Object.assign(new EventEmitter(), {
        stdin: mockStdin,
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("close", 0), 5);
        return mockChild;
      });

      const success = await copyToClipboard(
        "http://localhost:3000",
        "darwin",
        mockSpawn as unknown as SpawnFunction,
      );

      expect(success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith("pbcopy", [], expect.anything());
      expect(mockStdin.write).toHaveBeenCalledWith("http://localhost:3000", "utf-8");
      expect(mockStdin.end).toHaveBeenCalled();
    });

    it("spawns clip on win32 and writes to stdin", async () => {
      const mockStdin = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      });
      const mockChild = Object.assign(new EventEmitter(), {
        stdin: mockStdin,
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("close", 0), 5);
        return mockChild;
      });

      const success = await copyToClipboard(
        "http://localhost:3000",
        "win32",
        mockSpawn as unknown as SpawnFunction,
      );

      expect(success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        "clip",
        [],
        expect.objectContaining({ windowsHide: true }),
      );
      expect(mockStdin.write).toHaveBeenCalledWith("http://localhost:3000", "utf-8");
      expect(mockStdin.end).toHaveBeenCalled();
    });

    it("spawns xclip on linux", async () => {
      const mockStdin = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      });
      const mockChild = Object.assign(new EventEmitter(), {
        stdin: mockStdin,
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("close", 0), 5);
        return mockChild;
      });

      const success = await copyToClipboard(
        "http://localhost:3000",
        "linux",
        mockSpawn as unknown as SpawnFunction,
      );

      expect(success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        "xclip",
        ["-selection", "clipboard"],
        expect.anything(),
      );
    });

    it("resolves false on process error", async () => {
      const mockStdin = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      });
      const mockChild = Object.assign(new EventEmitter(), {
        stdin: mockStdin,
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("error", new Error("ENOENT")), 5);
        return mockChild;
      });

      const success = await copyToClipboard(
        "http://localhost:3000",
        "linux",
        mockSpawn as unknown as SpawnFunction,
      );
      expect(success).toBe(false);
    });

    it("resolves false on non-zero exit code", async () => {
      const mockStdin = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      });
      const mockChild = Object.assign(new EventEmitter(), {
        stdin: mockStdin,
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("close", 1), 5);
        return mockChild;
      });

      const success = await copyToClipboard(
        "http://localhost:3000",
        "linux",
        mockSpawn as unknown as SpawnFunction,
      );
      expect(success).toBe(false);
    });
  });
});
