// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  findDockerPortOwner,
  findPortOwner,
  findProcessPortOwner,
  formatPortOwnerDiagnostic,
  getPortSetting,
  mappingPublishesHostPort,
} from "../port-owner.js";

describe("port-owner", () => {
  describe("getPortSetting", () => {
    it("maps standard ports and fallback ranges to environment variables", () => {
      expect(getPortSetting(80)).toBe("FLISK_HTTP_PORT");
      expect(getPortSetting(8080)).toBe("FLISK_HTTP_PORT");
      expect(getPortSetting(8180)).toBe("FLISK_HTTP_PORT");

      expect(getPortSetting(443)).toBe("FLISK_HTTPS_PORT");
      expect(getPortSetting(8443)).toBe("FLISK_HTTPS_PORT");
      expect(getPortSetting(8543)).toBe("FLISK_HTTPS_PORT");

      expect(getPortSetting(5432)).toBe("FLISK_POSTGRES_PORT");
      expect(getPortSetting(15432)).toBe("FLISK_POSTGRES_PORT");
      expect(getPortSetting(15532)).toBe("FLISK_POSTGRES_PORT");
    });

    it("respects explicit environment variable overrides", () => {
      const env = { FLISK_HTTP_PORT: "3000", FLISK_POSTGRES_PORT: "9999" };
      expect(getPortSetting(3000, env)).toBe("FLISK_HTTP_PORT");
      expect(getPortSetting(9999, env)).toBe("FLISK_POSTGRES_PORT");
    });

    it("returns undefined for unmanaged ports", () => {
      expect(getPortSetting(7000, {})).toBeUndefined();
      expect(getPortSetting(22, {})).toBeUndefined();
    });
  });

  describe("findDockerPortOwner", () => {
    it("identifies a Docker container and its image owning the published port", () => {
      const dockerRunner = vi
        .fn()
        .mockReturnValue(
          "shop-api\texample/shop-api:latest\t0.0.0.0:8080->80/tcp, :::8080->80/tcp\n",
        );

      const owner = findDockerPortOwner(8080, dockerRunner);
      expect(owner).toEqual({
        ownerType: "docker",
        type: "docker",
        kind: "docker",
        port: 8080,
        container: "shop-api",
        name: "shop-api",
        image: "example/shop-api:latest",
        setting: "FLISK_HTTP_PORT",
      });
      expect(dockerRunner).toHaveBeenCalledWith([
        "ps",
        "--format",
        "{{.Names}}\t{{.Image}}\t{{.Ports}}",
      ]);
    });

    it("handles output with container name and ports without image", () => {
      const dockerRunner = vi.fn().mockReturnValue("my-db\t0.0.0.0:5432->5432/tcp\n");

      const owner = findDockerPortOwner(5432, dockerRunner);
      expect(owner).toMatchObject({
        ownerType: "docker",
        container: "my-db",
        port: 5432,
        setting: "FLISK_POSTGRES_PORT",
      });
    });

    it("handles multiple containers and selects the matching published port", () => {
      const dockerRunner = vi
        .fn()
        .mockReturnValue(
          [
            "unrelated\tunrelated:latest\t0.0.0.0:3000->3000/tcp",
            "target-api\tcompany/api:v1\t127.0.0.1:8080->80/tcp",
            "another\tanother:latest\t0.0.0.0:8081->80/tcp",
          ].join("\n"),
        );

      const owner = findDockerPortOwner(8080, dockerRunner);
      expect(owner).toMatchObject({
        ownerType: "docker",
        container: "target-api",
        image: "company/api:v1",
        port: 8080,
      });
    });

    it("does not match longer port numbers (e.g. 18080 vs 8080)", () => {
      const dockerRunner = vi
        .fn()
        .mockReturnValue("other-service\tother:latest\t0.0.0.0:18080->80/tcp\n");

      const owner = findDockerPortOwner(8080, dockerRunner);
      expect(owner).toBeNull();
    });

    it("returns null when Docker command throws (Docker unavailable)", () => {
      const dockerRunner = vi.fn().mockImplementation(() => {
        throw new Error("docker daemon is not running");
      });

      const owner = findDockerPortOwner(8080, dockerRunner);
      expect(owner).toBeNull();
    });

    it("returns null on malformed output", () => {
      const dockerRunner = vi
        .fn()
        .mockReturnValue("malformed output without proper tabs or ports\n");
      const owner = findDockerPortOwner(8080, dockerRunner);
      expect(owner).toBeNull();
    });
  });

  describe("findProcessPortOwner", () => {
    it("identifies a host process owning the port using lsof and ps", () => {
      const runner = vi.fn().mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "lsof") {
          expect(args).toEqual(["-nP", "-t", "-iTCP:8080", "-sTCP:LISTEN"]);
          return "4321\n";
        }
        if (cmd === "ps") {
          expect(args).toEqual(["-p", "4321", "-o", "comm="]);
          return "/usr/local/bin/node\n";
        }
        throw new Error(`Unexpected command ${cmd}`);
      });

      const owner = findProcessPortOwner(8080, "darwin", runner);
      expect(owner).toEqual({
        ownerType: "process",
        type: "process",
        kind: "process",
        port: 8080,
        process: "node",
        command: "node",
        name: "node",
        pid: 4321,
        setting: "FLISK_HTTP_PORT",
      });
    });

    it("returns null on win32 platform", () => {
      const runner = vi.fn();
      const owner = findProcessPortOwner(8080, "win32", runner);
      expect(owner).toBeNull();
      expect(runner).not.toHaveBeenCalled();
    });

    it("handles multiple PIDs from lsof gracefully by selecting the first valid PID", () => {
      const runner = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "lsof") return "9999\n8888\n7777\n";
        if (cmd === "ps") return "nginx\n";
        throw new Error(`Unexpected command ${cmd}`);
      });

      const owner = findProcessPortOwner(80, "linux", runner);
      expect(owner).toMatchObject({
        ownerType: "process",
        process: "nginx",
        pid: 9999,
        port: 80,
        setting: "FLISK_HTTP_PORT",
      });
    });

    it("returns null when lsof throws (e.g. lsof not installed or exits 1)", () => {
      const runner = vi.fn().mockImplementation(() => {
        throw new Error("lsof: command not found");
      });

      const owner = findProcessPortOwner(8080, "linux", runner);
      expect(owner).toBeNull();
    });

    it("returns null when lsof output is empty", () => {
      const runner = vi.fn().mockReturnValue("");
      const owner = findProcessPortOwner(8080, "linux", runner);
      expect(owner).toBeNull();
    });

    it("returns null on malformed non-integer PID", () => {
      const runner = vi.fn().mockReturnValue("not-a-pid\n");
      const owner = findProcessPortOwner(8080, "linux", runner);
      expect(owner).toBeNull();
    });
  });

  describe("findPortOwner integration", () => {
    it("prioritizes Docker container owner over host process", () => {
      const dockerRunner = vi
        .fn()
        .mockReturnValue("shop-api\texample/shop-api:latest\t0.0.0.0:8080->80/tcp\n");
      const processRunner = vi.fn().mockReturnValue("1234\n");

      const owner = findPortOwner(8080, { dockerRunner, processRunner });
      expect(owner?.ownerType).toBe("docker");
      expect(owner?.container).toBe("shop-api");
      expect(processRunner).not.toHaveBeenCalled();
    });

    it("falls back to host process when Docker finds no matching container", () => {
      const dockerRunner = vi.fn().mockReturnValue("");
      const processRunner = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "lsof") return "5678\n";
        if (cmd === "ps") return "caddy\n";
        return "";
      });

      const owner = findPortOwner(8080, { dockerRunner, processRunner });
      expect(owner?.ownerType).toBe("process");
      expect(owner?.process).toBe("caddy");
      expect(owner?.pid).toBe(5678);
    });

    it("falls back to host process when Docker is unavailable", () => {
      const dockerRunner = vi.fn().mockImplementation(() => {
        throw new Error("Docker down");
      });
      const processRunner = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "lsof") return "5678\n";
        if (cmd === "ps") return "caddy\n";
        return "";
      });

      const owner = findPortOwner(8080, { dockerRunner, processRunner });
      expect(owner?.ownerType).toBe("process");
      expect(owner?.process).toBe("caddy");
    });

    it("returns null when both Docker and lsof fail to identify an owner", () => {
      const dockerRunner = vi.fn().mockReturnValue("");
      const processRunner = vi.fn().mockImplementation(() => {
        throw new Error("lsof failed");
      });

      const owner = findPortOwner(8080, { dockerRunner, processRunner });
      expect(owner).toBeNull();
    });

    it("guarantees read-only behavior and never kills a process or stops a container", () => {
      const dockerRunner = vi
        .fn()
        .mockReturnValue("shop-api\texample/shop-api:latest\t0.0.0.0:8080->80/tcp\n");
      const processRunner = vi.fn();

      findPortOwner(8080, { dockerRunner, processRunner });

      for (const call of dockerRunner.mock.calls) {
        const args = call[0] as string[];
        expect(args[0]).toBe("ps");
        expect(args).not.toContain("stop");
        expect(args).not.toContain("kill");
        expect(args).not.toContain("rm");
      }
      for (const call of processRunner.mock.calls) {
        const cmd = call[0] as string;
        expect(["lsof", "ps"]).toContain(cmd);
        expect(cmd).not.toBe("kill");
      }
    });
  });

  describe("formatPortOwnerDiagnostic", () => {
    it("formats human output matching exact specification for Docker container", () => {
      const owner = {
        ownerType: "docker" as const,
        port: 8080,
        container: "shop-api",
        image: "example/shop-api:latest",
        setting: "FLISK_HTTP_PORT",
      };

      const diag = formatPortOwnerDiagnostic(8080, owner);
      expect(diag.message).toBe(
        [
          "Port 8080 is already in use.",
          "",
          "Owner: Docker container shop-api",
          "Image: example/shop-api:latest",
          "Port: 8080",
          "",
          "Suggested action:",
          "Change FLISK_HTTP_PORT to an available port,",
          "or manually stop the conflicting container.",
        ].join("\n"),
      );
      expect(diag.fix).toContain("Change FLISK_HTTP_PORT to an available port");
      expect(diag.fix).toContain("docker stop shop-api");
    });

    it("formats human output for host process", () => {
      const owner = {
        ownerType: "process" as const,
        port: 5432,
        process: "postgres",
        pid: 1234,
        setting: "FLISK_POSTGRES_PORT",
      };

      const diag = formatPortOwnerDiagnostic(5432, owner);
      expect(diag.message).toBe(
        [
          "Port 5432 is already in use.",
          "",
          "Owner: process postgres (PID 1234)",
          "Port: 5432",
          "",
          "Suggested action:",
          "Change FLISK_POSTGRES_PORT to an available port,",
          "or manually stop the conflicting process.",
        ].join("\n"),
      );
      expect(diag.fix).toContain("Change FLISK_POSTGRES_PORT to an available port");
      expect(diag.fix).toContain("PID 1234");
    });

    it("formats output when no configuration setting moves the port", () => {
      const owner = {
        ownerType: "docker" as const,
        port: 9000,
        container: "random-service",
        image: "random:latest",
      };

      const diag = formatPortOwnerDiagnostic(9000, owner);
      expect(diag.message).not.toContain("Change FLISK_");
      expect(diag.message).toContain("Manually stop the conflicting container.");
      expect(diag.fix).toContain("docker stop random-service");
    });

    it("preserves fallback message when owner cannot be determined", () => {
      const diag = formatPortOwnerDiagnostic(80, null, "Existing port message");
      expect(diag.message).toBe("Existing port message");
    });
  });
});

describe("getPortSetting explicit overrides", () => {
  it("labels an explicitly assigned HTTPS port by its override, not the HTTP default range", () => {
    expect(getPortSetting(8080, { FLISK_HTTPS_PORT: "8080" })).toBe("FLISK_HTTPS_PORT");
  });
});

describe("mappingPublishesHostPort", () => {
  it("matches a port inside a same-number published range", () => {
    expect(mappingPublishesHostPort("0.0.0.0:8080-8082->8080-8082/tcp", 8081)).toBe(true);
    expect(mappingPublishesHostPort("0.0.0.0:8080-8082->8080-8082/tcp", 8083)).toBe(false);
  });

  it("does not match a longer host port that starts with the wanted number", () => {
    expect(mappingPublishesHostPort("0.0.0.0:1080->80/tcp", 80)).toBe(false);
  });
});
