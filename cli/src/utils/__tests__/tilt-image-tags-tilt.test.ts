// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateStarlark, tiltAvailable } from "../../test-support/index.js";

// Tilt tags every app image <name>:tilt-<hash> next to the :dev tag compose uses, and keeps the previous build alive
// under its old tilt-* tag. The `tilt-image-tags` serve resource removes those tags. These tests take the script Tilt
// would run from the Starlark and run it against a fake `docker` that keeps its image tags in a file.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const resources = join(repoRoot, "runtime/engine/topologies/tilt/resources");
const imageTags = join(resources, "tilt_image_tags.star");
const infraLoader = join(resources, "infra-loader.star");
const hasTilt = tiltAvailable();

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface ServeManifest {
  Name: string;
  Labels?: Record<string, string>;
  DeployTarget: { ServeCmd?: { Argv: string[] } };
}

function manifests(
  file: string,
  args: string,
  options: { env?: Record<string, string>; files?: Record<string, string> } = {},
) {
  const result = evaluateStarlark(file, { args, ...options });
  if (result.status !== 0) throw new Error(`tilt failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout).Manifests as ServeManifest[];
}

function serveArgv(env: Record<string, string> = {}): string[] | undefined {
  const found = manifests(
    imageTags,
    `load(${JSON.stringify(imageTags)}, "register_tilt_image_tags")\nregister_tilt_image_tags("proj_")\n`,
    { env },
  ).find((m) => m.Name === "tilt-image-tags");
  return found?.DeployTarget.ServeCmd?.Argv;
}

// One line per tag: repository, tag, image id, creation time.
type Tag = [repo: string, tag: string, id: string, created: string];

interface RunOptions {
  images: Tag[];
  /** Lines `docker events` prints, after it applies `retag` to the image file. */
  events?: string[];
  /** Tags whose first `docker image rm` fails because a container still uses the image. */
  busy?: string[];
  /** Before printing events, point these :dev tags at another image: [repo, id, created]. */
  retag?: [string, string, string][];
}

const FAKE_DOCKER = `#!/bin/sh
echo "$*" >> "$FAKE_LOG"
ref_line() { awk -v r="$1" '$1 ":" $2 == r' "$FAKE_IMAGES"; }
case "$1 $2" in
  "image inspect")
    eval "ref=\\\${$#}"
    line=$(ref_line "$ref")
    [ -n "$line" ] || exit 1
    if [ "$3" = -f ]; then echo "$line" | awk '{print $3, $4}'; else echo '[]'; fi
    ;;
  "image ls")
    awk -v r="$5" 'r == "" || $1 == r {print $1 ":" $2}' "$FAKE_IMAGES"
    ;;
  "image rm")
    [ -n "$(ref_line "$3")" ] || { echo "No such image: $3" >&2; exit 1; }
    for b in $FAKE_BUSY; do
      if [ "$b" = "$3" ] && [ ! -f "$FAKE_DIR/freed-$3" ]; then
        touch "$FAKE_DIR/freed-$3"
        echo "conflict: unable to remove repository reference $3 (must force)" >&2
        exit 1
      fi
    done
    awk -v r="$3" '$1 ":" $2 != r' "$FAKE_IMAGES" > "$FAKE_IMAGES.next" && mv "$FAKE_IMAGES.next" "$FAKE_IMAGES"
    echo "Untagged: $3"
    ;;
  "events --since")
    [ -f "$FAKE_RETAG" ] && sh "$FAKE_RETAG"
    cat "$FAKE_EVENTS"
    ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
`;

/** Runs the serve script once (its `docker events` stream ends after the given lines) and returns what it left. */
function run(argv: string[], options: RunOptions) {
  const dir = mkdtempSync(join(tmpdir(), "flisk-tilt-tags-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "docker"), FAKE_DOCKER);
  chmodSync(join(bin, "docker"), 0o755);
  const images = join(dir, "images.txt");
  writeFileSync(images, `${options.images.map((t) => t.join(" ")).join("\n")}\n`);
  writeFileSync(join(dir, "events.txt"), (options.events ?? []).map((e) => `${e}\n`).join(""));
  const retag = join(dir, "retag.sh");
  if (options.retag) {
    writeFileSync(
      retag,
      options.retag
        .map(
          ([repo, id, created]) =>
            `awk -v r=${repo} '!($1 == r && $2 == "dev")' "$FAKE_IMAGES" > "$FAKE_IMAGES.next" && mv "$FAKE_IMAGES.next" "$FAKE_IMAGES"\necho "${repo} dev ${id} ${created}" >> "$FAKE_IMAGES"\n`,
        )
        .join(""),
    );
  }
  const log = join(dir, "docker.log");
  writeFileSync(log, "");
  const [cmd, ...args] = argv;
  const result = spawnSync(cmd as string, args, {
    encoding: "utf-8",
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_DIR: dir,
      FAKE_IMAGES: images,
      FAKE_EVENTS: join(dir, "events.txt"),
      FAKE_RETAG: retag,
      FAKE_BUSY: (options.busy ?? []).join(" "),
      FAKE_LOG: log,
    },
  });
  const left = readFileSync(images, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" ").slice(0, 2).join(":"))
    .sort();
  return { result, left, log: readFileSync(log, "utf-8") };
}

const T0 = "2026-10-27T09:00:00.1Z";
const T1 = "2026-10-27T10:00:00.123456Z";
const T2 = "2026-10-27T10:05:00.5Z";

describe.skipIf(!hasTilt)("tilt-image-tags resource", () => {
  it("is a serve-only infra.docker resource that gets this project's image prefix", () => {
    const argv = serveArgv();
    expect(argv?.slice(0, 2)).toEqual(["sh", "-c"]);
    expect(argv?.slice(3)).toEqual(["sh", "proj_"]);
  });

  it("is not added with FLISK_KEEP_TILT_TAGS=1", () => {
    expect(serveArgv({ FLISK_KEEP_TILT_TAGS: "1" })).toBeUndefined();
  });

  it("is added by Infra.load_all with the project name from .flisk/project.json", () => {
    // constants.star reads the project name under FLISK_PROJECT_ROOT, which `flisk up` sets.
    const project = mkdtempSync(join(tmpdir(), "flisk-tilt-tags-project-"));
    dirs.push(project);
    mkdirSync(join(project, ".flisk"));
    writeFileSync(
      join(project, ".flisk/project.json"),
      JSON.stringify({ project: { name: "my-shop" } }),
    );
    const found = manifests(
      infraLoader,
      `load(${JSON.stringify(infraLoader)}, "Infra")\nInfra.load_all(lambda name: False)\n`,
      { env: { FLISK_PROJECT_ROOT: project } },
    ).find((m) => m.Name === "tilt-image-tags");
    expect(found?.Labels).toEqual({ "infra.docker": "infra.docker" });
    expect(found?.DeployTarget.ServeCmd?.Argv.slice(3)).toEqual(["sh", "my_shop_"]);
  });

  it("at start removes the alias of each :dev image and older builds, and keeps the rest", () => {
    const { result, left, log } = run(serveArgv() as string[], {
      images: [
        ["proj_shop_web", "dev", "sha256:w2", T2],
        ["proj_shop_web", "tilt-w2", "sha256:w2", T2],
        ["proj_shop_web", "tilt-w1", "sha256:w1", T0],
        ["proj_shop_api", "dev", "sha256:a1", T1],
        ["proj_shop_api", "latest", "sha256:a1", T1],
        // Built after :dev and not tagged :dev yet: Tilt is about to tag it.
        ["proj_shop_api", "tilt-a2", "sha256:a2", T2],
        // No :dev tag, so nothing says which build is current.
        ["proj_orphan", "tilt-x1", "sha256:x1", T0],
        // Another project's images.
        ["other_shop_web", "dev", "sha256:o1", T1],
        ["other_shop_web", "tilt-o1", "sha256:o1", T1],
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("removed proj_shop_web:tilt-w2");
    expect(result.stdout).toContain("removed proj_shop_web:tilt-w1");
    expect(left).toEqual(
      [
        "proj_shop_web:dev",
        "proj_shop_api:dev",
        "proj_shop_api:latest",
        "proj_shop_api:tilt-a2",
        "proj_orphan:tilt-x1",
        "other_shop_web:dev",
        "other_shop_web:tilt-o1",
      ].sort(),
    );
    expect(log).toMatch(
      /^events --since \d+ --filter type=image --filter event=tag --filter type=container --filter event=destroy --format /m,
    );
  });

  it("removes the tilt-* tag when Tilt tags that build :dev, and ignores other projects' :dev tags", () => {
    const { result, left } = run(serveArgv() as string[], {
      images: [
        ["proj_shop_api", "dev", "sha256:a1", T1],
        ["proj_shop_api", "tilt-a2", "sha256:a2", T2],
        ["other_shop_web", "dev", "sha256:o1", T1],
        ["other_shop_web", "tilt-o1", "sha256:o1", T1],
      ],
      retag: [["proj_shop_api", "sha256:a2", T2]],
      events: ["image tag proj_shop_api:dev", "image tag other_shop_web:dev"],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(left).toEqual(
      ["other_shop_web:dev", "other_shop_web:tilt-o1", "proj_shop_api:dev"].sort(),
    );
  });

  it("orders builds by real time when the daemon reports local times across a daylight saving change", () => {
    const { result, left } = run(serveArgv() as string[], {
      images: [
        // 00:50 UTC. The clock went back from +02:00 to +01:00 at 01:00 UTC.
        ["proj_shop_web", "dev", "sha256:w2", "2026-10-25T02:50:00.25+02:00"],
        // 00:45 UTC: older, though its local time reads later.
        ["proj_shop_web", "tilt-w1", "sha256:w1", "2026-10-25T02:45:00+02:00"],
        // 01:10 UTC: newer (Tilt has not tagged it :dev yet), though its local time reads earlier.
        ["proj_shop_web", "tilt-w3", "sha256:w3", "2026-10-25T02:10:00.9+01:00"],
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(left).toEqual(["proj_shop_web:dev", "proj_shop_web:tilt-w3"]);
  });

  it("keeps a tilt-* tag whose creation time cannot be read", () => {
    const { result, left } = run(serveArgv() as string[], {
      images: [
        ["proj_shop_web", "dev", "sha256:w2", T2],
        ["proj_shop_web", "tilt-w1", "sha256:w1", "unknown"],
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(left).toEqual(["proj_shop_web:dev", "proj_shop_web:tilt-w1"]);
  });

  it("retries an old build still used by a container once a container is removed", () => {
    const { result, left, log } = run(serveArgv() as string[], {
      images: [
        ["proj_shop_web", "dev", "sha256:w2", T2],
        ["proj_shop_web", "tilt-w1", "sha256:w1", T0],
      ],
      busy: ["proj_shop_web:tilt-w1"],
      events: ["container destroy proj-shop-web-1"],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(log.match(/^image rm proj_shop_web:tilt-w1$/gm)).toHaveLength(2);
    expect(left).toEqual(["proj_shop_web:dev"]);
  });
});
