/**
 * The Tiltfile path from `tilt get session -o json --port <port>`. A Tilt session names the Tiltfile it loaded in
 * `spec.tiltfilePath`; `tilt get tiltfile -o json` names it in `spec.path`. Both are accepted so the check works
 * with either API answer. Returns null when the answer is missing or unparseable: unknown ownership is not foreign.
 */
export declare function sessionTiltfilePath(jsonText: string | null | undefined): string | null;
/**
 * Whether the running Tilt loaded this project's `.flisk/.flisk-out/Tiltfile`. Null means the API answer did not
 * identify a Tiltfile, so callers must keep using their previous ownership signal instead of guessing.
 */
export declare function tiltSessionIsForProject(jsonText: string | null | undefined, projectRoot: string): boolean | null;
