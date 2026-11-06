// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./collect-evidence.sh", import.meta.url));

// A stub tilt on PATH; no docker or flisk, so only the Tilt section writes anything.
const collectWithTilt = (logs) => {
  const bin = mkdtempSync(path.join(tmpdir(), "evidence-bin-"));
  writeFileSync(
    path.join(bin, "tilt"),
    `#!/bin/sh\ncase "$1" in\n  logs) cat <<'EOF'\n${logs}\nEOF\n ;;\n  get) echo "NAME CREATED AT" ;;\nesac\n`,
  );
  chmodSync(path.join(bin, "tilt"), 0o755);
  const out = path.join(mkdtempSync(path.join(tmpdir(), "evidence-out-")), "bundle");
  const run = spawnSync("bash", [script, out, "case-1"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
  });
  return { run, out };
};

test("the bundle carries what each Tilt resource printed, so a missing stack database shows its provision-db output", () => {
  const { run, out } = collectWithTilt(
    "provision-db-rotor_v │ ❌ Database enigma36_rotor_v could not be created\nprovision-db-rotor_v │ API_TOKEN=s3cr3t",
  );
  assert.equal(run.status, 0, run.stderr);
  const file = path.join(out, "tilt", "logs.log");
  assert.ok(existsSync(file), "tilt/logs.log is in the bundle");
  const text = readFileSync(file, "utf8");
  assert.match(text, /provision-db-rotor_v │ ❌ Database enigma36_rotor_v could not be created/);
  assert.doesNotMatch(text, /s3cr3t/, "the Tilt log is redacted like every other file");
});
