// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { makeResource } from "../../test-support/index.js";
import {
  dockerRunArgs,
  dockerRunLine,
  isNativeContainerService,
  NATIVE_CONTAINER_LABEL,
  nativeContainerName,
  shellQuote,
} from "../native-container.js";

const options = { projectName: "shop", projectRoot: "/tmp", envKeys: [] as string[] };

describe("containers in a local-process run", () => {
  it("takes only a ready-made image with no command and nothing to build", () => {
    expect(
      isNativeContainerService(makeResource("db", "bring-your-own", { image: "postgres" })),
    ).toBe(true);
    expect(
      isNativeContainerService(
        makeResource("db", "bring-your-own", { image: "postgres", command: "x" }),
      ),
    ).toBe(false);
    expect(
      isNativeContainerService(
        makeResource("db", "bring-your-own", { image: "postgres", dockerfile: "Dockerfile" }),
      ),
    ).toBe(false);
    expect(isNativeContainerService(makeResource("api", "backend"))).toBe(false);
  });

  it("names one container per project and service", () => {
    expect(nativeContainerName("My Shop", "postgres")).toBe("flisk-my-shop-postgres");
  });

  it("publishes on loopback, passes env by name and maps volumes and container options", () => {
    const resource = makeResource("cache", "bring-your-own", {
      image: "redis:8-alpine",
      port: 6379,
      extraPorts: [{ port: 8001, hostPort: 18001 }],
      volumes: [
        { source: "data", target: "/data" },
        { source: "pgdata", target: "/var/lib/postgresql/data", name: "app_dev_postgres" },
        { source: "./conf", target: "/conf", readOnly: true },
      ],
      container: {
        user: "999:1000",
        capDrop: ["ALL"],
        command: ["sh", "-c", 'redis-server --requirepass "$${REDIS_PASSWORD}"'],
      },
    });
    const { args, errors } = dockerRunArgs(resource, { ...options, envKeys: ["REDIS_PASSWORD"] });
    expect(errors).toEqual([]);
    expect(args).toEqual([
      "run",
      "--rm",
      "--name",
      "flisk-shop-cache",
      "--label",
      `${NATIVE_CONTAINER_LABEL}=/tmp`,
      "-p",
      "127.0.0.1:6379:6379",
      "-p",
      "127.0.0.1:18001:8001",
      "-e",
      "REDIS_PASSWORD",
      "-v",
      "shop_data:/data",
      "-v",
      "app_dev_postgres:/var/lib/postgresql/data",
      "-v",
      "/tmp/cache/conf:/conf:ro",
      "--init",
      "--cap-drop",
      "ALL",
      "--user",
      "999:1000",
      "redis:8-alpine",
      "sh",
      "-c",
      'redis-server --requirepass "${REDIS_PASSWORD}"',
    ]);
  });

  it("refuses a bind mount that leaves the project", () => {
    const resource = makeResource("db", "bring-your-own", {
      image: "postgres",
      volumes: [{ source: "../../etc", target: "/etc/x" }],
    });
    expect(dockerRunArgs(resource, options).errors).toEqual([
      expect.stringMatching(/volume \.\.\/\.\.\/etc is outside the project/),
    ]);
  });

  it("removes a leftover container first and execs docker run, quoting each word", () => {
    expect(
      dockerRunLine(["run", "--name", "flisk-shop-db", "img", "a b"], "flisk-shop-db", "darwin"),
    ).toBe(
      "docker rm -f flisk-shop-db >/dev/null 2>&1; exec docker run --name flisk-shop-db img 'a b'",
    );
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});
