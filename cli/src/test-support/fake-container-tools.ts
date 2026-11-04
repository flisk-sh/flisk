// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Puts a stub `docker` and `tilt` first on PATH, so a test of the preflight that blocks `flisk up` on a missing Docker or Tilt
// behaves the same on a machine without them (a hosted macOS runner) as on one with them (#2898). The stubs only answer the
// version and liveness probes the machine checks run; they start nothing.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const DOCKER = `#!/bin/sh
case "$1 $2 $3" in
  "compose version --short") echo "2.29.0" ;;
  "compose version "*) echo "Docker Compose version v2.29.0" ;;
  "--version "*) echo "Docker version 27.0.0, build stub" ;;
  "version --format "*) echo "27.0.0" ;;
  "info "*|"ps "*) echo "stub" ;;
esac
exit 0
`;

const TILT = `#!/bin/sh
[ "$1" = "version" ] && echo "v0.37.8, built 2025-01-01"
exit 0
`;

/** Prepends the stub tools to PATH. Returns the function that puts PATH back and removes them. */
export function installFakeContainerTools(): () => void {
  const dir = mkdtempSync(join(tmpdir(), "flisk-fake-tools-"));
  for (const [name, body] of [
    ["docker", DOCKER],
    ["tilt", TILT],
  ] as const) {
    const file = join(dir, name);
    writeFileSync(file, body);
    chmodSync(file, 0o755);
  }
  const previous = process.env.PATH;
  process.env.PATH = previous ? `${dir}${delimiter}${previous}` : dir;
  return () => {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  };
}
