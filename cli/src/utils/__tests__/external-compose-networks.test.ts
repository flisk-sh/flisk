// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configCommand } from "../../commands/config.js";
import { parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../discovery-context.js";
import {
  checkExternalComposeNetworks,
  discoverProjectComposeFiles,
  externalNetworkWarnings,
  isSafeDockerNetworkName,
  parseExternalComposeNetworks,
  scanProjectExternalNetworks,
} from "../external-compose-networks.js";

let root: string;

function writeFile(relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function initProject(name = "acme-app", extra: Record<string, unknown> = {}): void {
  writeFile(
    ".flisk/project.json",
    JSON.stringify({
      version: "1.0",
      project: { name, version: "1.0.0" },
      phases: {
        pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: [] },
        alpha: { name: "Alpha", description: "", enabledStacks: [] },
        beta: { name: "Beta", description: "", enabledStacks: [] },
        out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
      },
      optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image: false,
        verdaccio: false,
      },
      discovery: { paths: ["services/*/*"] },
      ...extra,
    }),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "flisk-ext-networks-"));
  initProject();
  clearDiscoveryCache(root);
});

afterEach(() => {
  clearDiscoveryCache(root);
  rmSync(root, { recursive: true, force: true });
});

describe("parseExternalComposeNetworks", () => {
  it("extracts external: true networks with explicit name and implicit key", () => {
    const yaml = `
services:
  nats:
    image: nats:2-alpine
    networks:
      - traefik-private
      - acme_app_proxy

networks:
  traefik-private:
    name: acme_app_traefik-private
    external: true
  acme_app_proxy:
    external: true # required
  internal:
    driver: bridge
  disabled:
    name: acme_app_disabled
    external: false
`;
    expect(parseExternalComposeNetworks(yaml)).toEqual([
      {
        key: "traefik-private",
        name: "acme_app_traefik-private",
        rawName: "acme_app_traefik-private",
        unresolvedVars: [],
      },
      {
        key: "acme_app_proxy",
        name: "acme_app_proxy",
        rawName: "acme_app_proxy",
        unresolvedVars: [],
      },
    ]);
  });

  it("handles legacy external: { name } block/flow forms, quotes, and flow maps", () => {
    const yaml = `
networks:
  legacy_block:
    external:
      name: "acme_app_legacy_block"
  legacy_flow:
    external: { name: 'acme_app_legacy_flow' }
  inline_net: { external: true, name: acme_app_inline }
  inline_false: { external: false, name: acme_app_no }

volumes:
  data:
    external: true
`;
    expect(parseExternalComposeNetworks(yaml).map((entry) => entry.name)).toEqual([
      "acme_app_legacy_block",
      "acme_app_legacy_flow",
      "acme_app_inline",
    ]);
  });

  it("expands Compose variables and records unresolved ones", () => {
    const yaml = `
networks:
  from_env:
    name: \${PROJECT_PREFIX}_traefik-private
    external: true
  from_default:
    name: \${UNSET_PREFIX:-acme_app}_proxy
    external: true
  missing_var:
    name: \${MISSING_PREFIX}_bus
    external: true
`;
    expect(parseExternalComposeNetworks(yaml, { PROJECT_PREFIX: "acme_app" })).toEqual([
      {
        key: "from_env",
        name: "acme_app_traefik-private",
        rawName: "$" + "{PROJECT_PREFIX}_traefik-private",
        unresolvedVars: [],
      },
      {
        key: "from_default",
        name: "acme_app_proxy",
        rawName: "$" + "{UNSET_PREFIX:-acme_app}_proxy",
        unresolvedVars: [],
      },
      {
        key: "missing_var",
        name: "_bus",
        rawName: "$" + "{MISSING_PREFIX}_bus",
        unresolvedVars: ["MISSING_PREFIX"],
      },
    ]);
  });

  it("validates Docker network name safety", () => {
    expect(isSafeDockerNetworkName("acme_app_traefik-private")).toBe(true);
    expect(isSafeDockerNetworkName("acme.net-1")).toBe(true);
    expect(isSafeDockerNetworkName("")).toBe(false);
    expect(isSafeDockerNetworkName("-leading-dash")).toBe(false);
    expect(isSafeDockerNetworkName("acme_app; rm -rf /")).toBe(false);
    expect(isSafeDockerNetworkName("acme_app$(id)")).toBe(false);
  });
});

describe("scanProjectExternalNetworks and warnings/doctor", () => {
  it("skips cleanly when no project compose file declares extra external networks", () => {
    expect(externalNetworkWarnings(root)).toEqual([]);
    const result = checkExternalComposeNetworks(root, [], () => []);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
  });

  it("treats <project>_* external networks in messaging and platform proxy compose as managed by init-networks", () => {
    writeFile(
      "services/platform/messaging/docker-compose.yml",
      `services:
  nats:
    image: nats:2-alpine
networks:
  traefik-private:
    name: acme_app_traefik-private
    external: true
`,
    );
    const proxyFiles = [
      "shared-product-engineering/introvertic/infra/docker-compose.traefik.yml",
      "services/platform/proxy/docker-compose.core.yml",
      "services/platform/proxy/docker-compose.utilities.yml",
      "services/platform/proxy/docker-compose.redirects.yml",
      "services/platform/proxy/docker-compose.docs.yml",
    ];
    for (const file of proxyFiles) {
      writeFile(
        file,
        file.endsWith("docker-compose.core.yml")
          ? `services: {}
networks:
  proxy:
    name: acme_app_proxy
    external: true
`
          : "services: {}\n",
      );
    }

    const discovered = discoverProjectComposeFiles(root, []);
    expect(discovered).toHaveLength(6);

    const scan = scanProjectExternalNetworks(root, []);
    expect(scan.managed.map((entry) => entry.name).sort()).toEqual([
      "acme_app_proxy",
      "acme_app_traefik-private",
    ]);
    expect(scan.unmanaged).toEqual([]);
    expect(scan.staleManaged).toEqual([]);

    expect(externalNetworkWarnings(root, [])).toEqual([]);
    const doctorResult = checkExternalComposeNetworks(root, [], () => []);
    expect(doctorResult.didPass).toBe(true);
    expect(doctorResult.isSkipped).toBeUndefined();
    expect(doctorResult.message).toContain("acme_app_proxy");
    expect(doctorResult.message).toContain("acme_app_traefik-private");
  });

  it("warns in verify and fails in doctor when a compose file declares a missing non-project external network", () => {
    writeFile(
      "services/platform/messaging/docker-compose.yml",
      `services:
  nats:
    image: nats:2-alpine
networks:
  shared:
    name: legacy_project_traefik-private
    external: true
`,
    );

    const warnings = externalNetworkWarnings(root, []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("services/platform/messaging/docker-compose.yml");
    expect(warnings[0]).toContain("legacy_project_traefik-private");
    expect(warnings[0]).toContain("acme_app_*");

    const missing = checkExternalComposeNetworks(root, [], () => ["bridge", "acme_app_backend"]);
    expect(missing.didPass).toBe(false);
    expect(missing.message).toContain("legacy_project_traefik-private");
    expect(missing.message).toContain("services/platform/messaging/docker-compose.yml");
    expect(missing.fix).toContain("docker network create legacy_project_traefik-private");

    const present = checkExternalComposeNetworks(root, [], () => [
      "bridge",
      "legacy_project_traefik-private",
    ]);
    expect(present.didPass).toBe(true);

    const noDocker = checkExternalComposeNetworks(root, [], () => null);
    expect(noDocker.didPass).toBe(false);
    expect(noDocker.isWarning).toBe(true);
    expect(noDocker.message).toContain("legacy_project_traefik-private");
  });

  it("flags stale vendored extensions that predate external compose network scanning", () => {
    writeFile(
      "services/platform/messaging/docker-compose.yml",
      `services:
  nats:
    image: nats:2-alpine
networks:
  traefik-private:
    name: acme_app_traefik-private
    external: true
`,
    );
    writeFile(
      ".flisk/.flisk-out/flisk-cli-ext/engine/topologies/tilt/resources/infra-loader.star",
      "def _init_networks(fix_docker_networks_fn, should_enable=None):\n    pass\n",
    );

    const warnings = externalNetworkWarnings(root, []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("acme_app_traefik-private");
    expect(warnings[0]).toContain("flisk config regenerate");

    const missing = checkExternalComposeNetworks(root, [], () => ["bridge"]);
    expect(missing.didPass).toBe(false);
    expect(missing.message).toContain("acme_app_traefik-private");
    expect(missing.fix).toContain("flisk config regenerate");

    const alreadyCreated = checkExternalComposeNetworks(root, [], () => [
      "acme_app_traefik-private",
    ]);
    expect(alreadyCreated.didPass).toBe(true);
  });

  it("reports unresolved variable names in verify warnings and doctor", () => {
    writeFile(
      "services/platform/messaging/docker-compose.yml",
      `services:
  nats:
    image: nats:2-alpine
networks:
  custom:
    name: \${CUSTOM_PREFIX}_bus
    external: true
`,
    );

    const warnings = externalNetworkWarnings(root, [], {});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("CUSTOM_PREFIX");

    const doctorResult = checkExternalComposeNetworks(root, [], () => [], {});
    expect(doctorResult.didPass).toBe(false);
    expect(doctorResult.message).toContain("CUSTOM_PREFIX");
    expect(doctorResult.fix).toContain("Set the missing environment variable");
  });

  it("surfaces external network warnings in flisk config verify --json", async () => {
    writeFile(
      "services/platform/messaging/docker-compose.yml",
      `services:
  nats:
    image: nats:2-alpine
networks:
  proxy:
    name: other_proj_proxy
    external: true
`,
    );

    const regen = await runCommandInProcess(configCommand, ["regenerate", "--json"], root);
    expect(regen.status).toBeUndefined();

    const verify = await runCommandInProcess(configCommand, ["verify", "--json"], root);
    expect(verify.status).toBeUndefined();
    const report = parseEnvelope(verify.stdout);
    expect(report.data.valid).toBe(true);
    expect(report.data.warnings).toContainEqual(expect.stringContaining("other_proj_proxy"));
  });
});
