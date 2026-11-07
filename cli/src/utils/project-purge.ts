// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { toComposeProjectName } from "./compose-project-name.js";
import { projectNetworkNames } from "./down-cleanup.js";

/** Runs `docker <args>` and returns stdout; throws when docker exits non-zero. */
export type DockerRun = (args: string[]) => string;

const defaultDocker: DockerRun = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

/** What one Flisk project left in Docker. */
export interface ProjectArtifacts {
  containers: string[];
  volumes: string[];
  networks: string[];
  /** `repository:tag` references: the project's golden layer tags and its service images. */
  images: string[];
}

export interface PurgeResult {
  removed: ProjectArtifacts;
  /** Objects Docker refused to remove, usually because another container still uses them. */
  kept: { kind: keyof ProjectArtifacts; name: string; reason: string }[];
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The name in `names` that owns `candidate` when Flisk joins the name and a suffix with `separator`, or undefined. The
 * longest match wins, so project `shop` does not claim `shop-admin-database-management` while `shop-admin` is known.
 */
export function ownerOf(
  candidate: string,
  separator: "-" | "_",
  names: readonly string[],
  transform: (name: string) => string = (name) => name,
): string | undefined {
  let best: string | undefined;
  for (const name of names) {
    const prefix = transform(name) + separator;
    if (
      candidate.startsWith(prefix) &&
      (!best || transform(best).length < transform(name).length)
    ) {
      best = name;
    }
  }
  return best;
}

/** The golden layer keys (GOLDEN_LAYERS in golden_image_constants.star) and the retired l3-migrator. */
const GOLDEN_LAYERS = new Set([
  "l1",
  "l2",
  "l3-backend",
  "l3-frontend",
  "l3-migrator",
  "l4-backend",
  "l4-backend-node",
  "l4-frontend",
  "l4-migrator",
]);

/**
 * Lists the Docker objects of project `name`. `knownNames` are the other Flisk project names on this machine; they only
 * settle prefix ties (see {@link ownerOf}). Ownership is by the names the engine gives: Compose projects
 * `<name>-<infra or stack>` (containers and volumes), networks `<name_underscored>_<suffix>`, golden images
 * `<name>-l<layer>` and service images `<name_underscored>_<stack>_<service>`. A volume without a Compose project label
 * is never claimed.
 */
export function listProjectArtifacts(
  name: string,
  knownNames: readonly string[] = [],
  docker: DockerRun = defaultDocker,
): ProjectArtifacts {
  const names = [...new Set([name, ...knownNames])];
  const owns = (candidate: string, separator: "-" | "_", underscored = false) =>
    ownerOf(candidate, separator, names, underscored ? toComposeProjectName : undefined) === name;

  const read = (args: string[]): string[] => {
    try {
      return lines(docker(args));
    } catch {
      return [];
    }
  };

  const containers = read([
    "ps",
    "-a",
    "--format",
    '{{.Names}}\t{{.Label "com.docker.compose.project"}}',
  ])
    .map((line) => line.split("\t"))
    .filter(([, composeProject = ""]) => composeProject !== "" && owns(composeProject, "-"))
    .map(([container = ""]) => container);

  const volumes = read([
    "volume",
    "ls",
    "--format",
    '{{.Name}}\t{{.Label "com.docker.compose.project"}}',
  ])
    .map((line) => line.split("\t"))
    .filter(([, composeProject = ""]) => composeProject !== "" && owns(composeProject, "-"))
    .map(([volume = ""]) => volume);

  const existingNetworks = new Set(read(["network", "ls", "--format", "{{.Name}}"]));
  const networks = projectNetworkNames(name).filter((network) => existingNetworks.has(network));

  const images = read(["images", "--format", "{{.Repository}}:{{.Tag}}"]).filter((ref) => {
    const [repository = "", tag = ""] = ref.split(/:(?=[^:]*$)/);
    if (!repository || repository === "<none>" || tag === "<none>") return false;
    if (repository.startsWith(`${name}-`) && GOLDEN_LAYERS.has(repository.slice(name.length + 1))) {
      return true;
    }
    return owns(repository, "_", true);
  });

  return { containers, volumes, networks, images };
}

function firstLine(err: unknown): string {
  const stderr = String((err as { stderr?: Buffer | string }).stderr ?? err).trim();
  return stderr.split(/\r?\n/)[0] ?? "";
}

/**
 * Removes what {@link listProjectArtifacts} found: containers first (they hold the volumes and networks), then
 * volumes, networks and images. Images are untagged without `--force`, so an image another container runs stays.
 */
export function removeProjectArtifacts(
  artifacts: ProjectArtifacts,
  docker: DockerRun = defaultDocker,
): PurgeResult {
  const result: PurgeResult = {
    removed: { containers: [], volumes: [], networks: [], images: [] },
    kept: [],
  };
  const steps: [keyof ProjectArtifacts, (name: string) => string[]][] = [
    ["containers", (name) => ["rm", "-f", name]],
    ["volumes", (name) => ["volume", "rm", name]],
    ["networks", (name) => ["network", "rm", name]],
    ["images", (name) => ["image", "rm", name]],
  ];
  for (const [kind, args] of steps) {
    for (const name of artifacts[kind]) {
      try {
        docker(args(name));
        result.removed[kind].push(name);
      } catch (err) {
        result.kept.push({ kind, name, reason: firstLine(err) });
      }
    }
  }
  return result;
}

export function countArtifacts(artifacts: ProjectArtifacts): number {
  return (
    artifacts.containers.length +
    artifacts.volumes.length +
    artifacts.networks.length +
    artifacts.images.length
  );
}
