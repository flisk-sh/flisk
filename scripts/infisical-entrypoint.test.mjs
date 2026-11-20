// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// End-to-end POSIX sh tests for infisical-entrypoint.sh:
// - removes temporary plaintext secrets file BEFORE exec (EXIT trap never fires across exec)
// - exports valid KEY=VALUE pairs (including values with '=' and shell metacharacters) without eval
// - reassembles multi-line PEM values without leaking base64 lines as separate variables
// - skips invalid variable names (including ';' command injection attempts) safely
// - preserves pre-set environment variables and TILT_* overrides
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRYPOINT = path.join(
  ROOT,
  "cli/shared-platform-engineering/docker-templates/infisical-entrypoint.sh",
);

function availableShells() {
  const candidates = [
    { name: "sh", cmd: "sh", args: [] },
    { name: "dash", cmd: "dash", args: [] },
    { name: "busybox sh", cmd: "busybox", args: ["sh"] },
  ];
  return candidates.filter(({ cmd, args }) => {
    const probe = spawnSync(cmd, [...args, "-c", "exit 0"], { encoding: "utf8" });
    return probe.status === 0;
  });
}

function makeFixture(secretsBody) {
  const workDir = mkdtempSync(path.join(tmpdir(), "flisk-infisical-ep-"));
  const binDir = path.join(workDir, "bin");
  const tmpDir = path.join(workDir, "tmp");
  const secretsFixture = path.join(workDir, "secrets.txt");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(secretsFixture, secretsBody);

  const fakeInfisical = path.join(binDir, "infisical");
  writeFileSync(
    fakeInfisical,
    `#!/bin/sh
case "$1" in
  login) exit 0 ;;
  run) exit 0 ;;
  secrets)
    cat "$FAKE_INFISICAL_SECRETS_FILE"
    exit 0
    ;;
  *) exit 0 ;;
esac
`,
  );
  chmodSync(fakeInfisical, 0o755);

  for (const stub of ["nc", "psql"]) {
    const stubPath = path.join(binDir, stub);
    writeFileSync(stubPath, "#!/bin/sh\nexit 0\n");
    chmodSync(stubPath, 0o755);
  }

  return { workDir, binDir, tmpDir, secretsFixture };
}

for (const shell of availableShells()) {
  test(`infisical-entrypoint.sh under ${shell.name}: deletes temp secrets before exec and avoids eval injection`, () => {
    const sentinelDir = mkdtempSync(path.join(tmpdir(), "flisk-infisical-sentinel-"));
    const sentinel1 = path.join(sentinelDir, "pwn1");
    const sentinel2 = path.join(sentinelDir, "pwn2");
    const sentinel3 = path.join(sentinelDir, "pwn3");

    // Assemble synthetic PEM markers at runtime so the tracked-secrets scanner
    // does not flag this test fixture as a committed private key.
    const pemBegin = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const pemEnd = ["-----END", "PRIVATE KEY-----"].join(" ");
    const pemValue = [
      pemBegin,
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSj",
      "MIIEowIBAAKCAQEA==",
      pemEnd,
    ].join("\n");

    // Intentionally omit a trailing newline on the final line to test EOF handling too.
    const secretsOutput = [
      `PRIVATE_KEY=${pemValue}`,
      `x;touch ${sentinel1}`,
      `BAD;NAME=touch ${sentinel2}`,
      "1INVALID_START=should-skip",
      "BAD-DASH=should-skip",
      `SHELL_META=$(touch ${sentinel3});echo \`id\``,
      "API_URL=https://example.com/cb?a=1&b=2==",
      "ALREADY_SET=from-infisical",
      "DATABASE_URL=postgres://infisical-should-not-win",
      "FINAL_NO_NEWLINE=kept",
    ].join("\n");

    const { workDir, binDir, tmpDir, secretsFixture } = makeFixture(secretsOutput);
    try {
      const inspector = [
        "const fs = require('node:fs');",
        "const out = {",
        "  tmpFiles: fs.readdirSync(process.env.TMPDIR),",
        "  PRIVATE_KEY: process.env.PRIVATE_KEY,",
        "  MIIEowIBAAKCAQEA: process.env.MIIEowIBAAKCAQEA,",
        "  API_URL: process.env.API_URL,",
        "  SHELL_META: process.env.SHELL_META,",
        "  ALREADY_SET: process.env.ALREADY_SET,",
        "  DATABASE_URL: process.env.DATABASE_URL,",
        "  FINAL_NO_NEWLINE: process.env.FINAL_NO_NEWLINE,",
        "};",
        "process.stdout.write('__RESULT__' + JSON.stringify(out) + '\\n');",
      ].join(" ");

      const run = spawnSync(
        shell.cmd,
        [...shell.args, ENTRYPOINT, process.execPath, "-e", inspector],
        {
          encoding: "utf8",
          env: {
            PATH: `${binDir}:${process.env.PATH ?? "/usr/bin:/bin"}`,
            TMPDIR: tmpDir,
            FAKE_INFISICAL_SECRETS_FILE: secretsFixture,
            SERVICE_NAME: "billing-api",
            INFISICAL_ENABLED: "true",
            INFISICAL_CLIENT_ID: "client-id",
            INFISICAL_CLIENT_SECRET: "client-secret",
            INFISICAL_PROJECT_ID: "project-id",
            INFISICAL_ENV: "dev",
            INFISICAL_SITE_URL: "http://127.0.0.1:8080",
            DB_WAIT_TIMEOUT: "1",
            DB_WAIT_INTERVAL: "1",
            AUTO_MIGRATE: "false",
            ALREADY_SET: "from-env",
            TILT_DATABASE_URL: "postgres://tilt-wins",
          },
        },
      );

      assert.equal(
        run.status,
        0,
        `expected exit 0, got ${run.status}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
      );

      const marker = run.stdout.split("\n").find((line) => line.startsWith("__RESULT__"));
      assert.ok(marker, `missing inspector output in stdout:\n${run.stdout}`);
      const parsed = JSON.parse(marker.slice("__RESULT__".length));

      // 1. Plaintext temp secrets file must be gone BEFORE exec runs the app process
      assert.deepEqual(
        parsed.tmpFiles,
        [],
        `leftover files in TMPDIR before exec: ${parsed.tmpFiles.join(", ")}`,
      );
      assert.deepEqual(readdirSync(tmpDir), []);

      // 2. No command injection from unvalidated keys or metacharacter values
      assert.equal(existsSync(sentinel1), false, "line without '=' must not execute commands");
      assert.equal(existsSync(sentinel2), false, "invalid key with ';' must not execute commands");
      assert.equal(
        existsSync(sentinel3),
        false,
        "shell metacharacters in value must not execute commands",
      );

      // 3. Multi-line PEM secret preserved verbatim and base64 padding line not leaked as a var
      assert.equal(parsed.PRIVATE_KEY, pemValue);
      assert.equal(parsed.MIIEowIBAAKCAQEA, undefined);

      // 4. Values containing '=' and shell metacharacters exported literally
      assert.equal(parsed.API_URL, "https://example.com/cb?a=1&b=2==");
      assert.equal(parsed.SHELL_META, `$(touch ${sentinel3});echo \`id\``);
      assert.equal(parsed.FINAL_NO_NEWLINE, "kept");

      // 5. Already-set env vars and TILT_* overrides take precedence over Infisical
      assert.equal(parsed.ALREADY_SET, "from-env");
      assert.equal(parsed.DATABASE_URL, "postgres://tilt-wins");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
      rmSync(sentinelDir, { recursive: true, force: true });
    }
  });
}
