/** Runs `docker <args>` and returns stdout; throws when docker exits non-zero. */
export type DockerRun = (args: string[]) => string;
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
    kept: {
        kind: keyof ProjectArtifacts;
        name: string;
        reason: string;
    }[];
}
/**
 * The name in `names` that owns `candidate` when Flisk joins the name and a suffix with `separator`, or undefined. The
 * longest match wins, so project `shop` does not claim `shop-admin-database-management` while `shop-admin` is known.
 */
export declare function ownerOf(candidate: string, separator: "-" | "_", names: readonly string[], transform?: (name: string) => string): string | undefined;
/**
 * Lists the Docker objects of project `name`. `knownNames` are the other Flisk project names on this machine; they only
 * settle prefix ties (see {@link ownerOf}). Ownership is by the names the engine gives: Compose projects
 * `<name>-<infra or stack>` (containers and volumes), networks `<name_underscored>_<suffix>`, golden images
 * `<name>-l<layer>` and service images `<name_underscored>_<stack>_<service>`. A volume without a Compose project label
 * is never claimed.
 */
export declare function listProjectArtifacts(name: string, knownNames?: readonly string[], docker?: DockerRun): ProjectArtifacts;
/**
 * Removes what {@link listProjectArtifacts} found: containers first (they hold the volumes and networks), then
 * volumes, networks and images. Images are untagged without `--force`, so an image another container runs stays.
 */
export declare function removeProjectArtifacts(artifacts: ProjectArtifacts, docker?: DockerRun): PurgeResult;
export declare function countArtifacts(artifacts: ProjectArtifacts): number;
