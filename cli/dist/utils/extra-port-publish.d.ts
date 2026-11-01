/**
 * `extraPorts[].publish` (#2947): the host side of a Compose port mapping, `"${WEB_HTTP_BIND:-127.0.0.1:80}"`, so a
 * `.env` setting that Compose projects already use keeps working. Mirrors _parse_publish in
 * engine/.../compose/byo_ports.star. The string is written into the generated Compose file as it is, so only digits, `.`, `:`
 * and `${NAME:-default}` (or `${NAME-default}`, the default only when NAME is unset) are accepted, and every variable must carry a default (the safe value is then visible in service.json
 * and a missing `.env` entry cannot leave the mapping empty).
 */
export interface PublishVariable {
    name: string;
    fallback: string;
    /** `${NAME-default}`: the default only when NAME is unset; `${NAME:-default}` also uses it when NAME is empty. */
    unsetOnly: boolean;
}
export interface HostMapping {
    /** The host address, or null when the mapping names only a port (Docker then publishes on every interface). */
    address: string | null;
    port: number;
}
/** The variables a `publish` template names, or the reason it is refused. */
export declare function publishVariables(publish: string): PublishVariable[] | string;
/**
 * Substitutes each variable like Compose: `${VAR:-default}` with `lookup(name)` when it is non-empty, `${VAR-default}` when it
 * is set at all, and otherwise with the default.
 */
export declare function substitutePublish(publish: string, lookup?: (name: string) => string | undefined): string;
/** `80` or `127.0.0.1:8080` as a host mapping, or null when it is neither. */
export declare function parseHostMapping(value: string): HostMapping | null;
/** Where Compose reads a variable from: the shell of `flisk up` first, then the project `.env`. */
export declare function projectEnvLookup(projectRoot: string | undefined): (name: string) => string | undefined;
