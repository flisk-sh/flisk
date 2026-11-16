/**
 * `extraPorts` (#2909): plain host ports on 127.0.0.1 for a bring-your-own resource, next to the routed `port`. Mirrors
 * engine/.../compose/byo_ports.star, which refuses the same values.
 */
export declare function extraPortsErrors(manifest: Record<string, unknown>, displayPath: string): string[];
