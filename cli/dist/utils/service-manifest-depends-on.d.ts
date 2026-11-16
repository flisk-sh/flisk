/**
 * `dependsOn`: service or stack names, or Compose-style objects `{ "name": "db", "condition": "service_healthy" }`. Flisk orders by
 * name (Tilt resource_deps), so the condition is accepted and kept but does not change the order. Mirrors normalize_depends_on in
 * engine/.../tilt/manifest/parser.star.
 */
export declare function dependsOnErrors(manifest: Record<string, unknown>, displayPath: string): string[];
