import { Command } from "commander";
/** GET with node:http because fetch silently drops a custom Host header, which is what Traefik routes on. */
export declare function httpGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{
    ok: boolean;
    status: number;
    text: string;
}>;
/**
 * Agent containers publish no host port; the only way in is the Traefik route that `flisk status` prints as `url`
 * (for example http://api.<project>.localhost:8080/api/bot). `*.localhost` does not resolve everywhere (glibc without
 * systemd-resolved), so connect to loopback and keep the route's host in the Host header, which is all Traefik matches on.
 */
export declare function agentSessionRequest(routeUrl: string, sessionId: string): {
    url: string;
    headers: Record<string, string>;
};
export declare const agentCommand: Command;
