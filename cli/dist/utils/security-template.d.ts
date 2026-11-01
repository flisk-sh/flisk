/** The security-agent starter: scanner, triage and reporter, all local processes (no Docker). */
export declare const SECURITY_PORTS: {
    readonly scanner: 4200;
    readonly triage: 4201;
    readonly reporter: 4202;
};
/** The service.json of each agent, keyed by its path in the project folder. */
export declare function securityManifests(): Record<string, Record<string, unknown>>;
/** Writes the security-agent project into `dir`. */
export declare function writeSecurityProject(dir: string, readTemplate?: (name: string) => string): void;
