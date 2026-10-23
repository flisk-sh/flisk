/**
 * Rows the frame always occupies.
 *
 * A fixed height is what keeps the terminal from scrolling, which matters most when the
 * demo is recorded: a frame that grows pushes everything off the screen.
 */
export declare const FRAME_ROWS = 12;
export type DemoPhaseStatus = "pending" | "active" | "done" | "failed";
export type DemoPhase = {
    id: string;
    label: string;
    status: DemoPhaseStatus;
    elapsedMs?: number;
};
export type DemoDone = {
    /** The URLs worth putting on screen, most important first. */
    urls: string[];
    /** One line of facts about what was wired: "6 services · Postgres · Traefik". */
    summary: string;
    /** The one thing the viewer should try next. */
    hint: string;
    /** The CLI version, so a recording never leaves "which build is this" unanswered. */
    version: string;
};
export type DemoState = {
    title: string;
    subtitle: string;
    phases: DemoPhase[];
    servicesReady: number;
    servicesTotal: number;
    servicesBuilding: number;
    /** What the setup produced, e.g. "240 config files generated". */
    detail?: string;
    elapsedMs: number;
    failure?: {
        message: string;
        fix?: string;
        logPath?: string;
    };
    done?: DemoDone;
};
type Style = "plain" | "bold" | "dim" | "ok" | "warn" | "err";
export type Segment = {
    text: string;
    style: Style;
};
export type FrameRow = Segment[];
/**
 * Control characters, including ESC, are removed from every value that reaches the frame.
 *
 * A repo name or an error line from git can carry ANSI sequences. Painted verbatim they
 * can move the cursor and shred a fixed frame, which on a recording looks like the tool broke.
 * A newline is flattened too: every cell is exactly one row tall.
 */
export declare function sanitizeCell(value: string): string;
/** `0.9s`, `12.4s`, `1m 12s`. Short enough to sit in a right-aligned column. */
export declare function formatElapsed(ms: number): string;
/**
 * Builds the frame as plain segments. No I/O, no clock, no terminal size.
 *
 * Keeping this pure is what makes the transcript snapshot-testable and the recording
 * deterministic: the same state always paints the same twelve rows.
 */
export declare function renderDemoFrame(state: DemoState, columns?: number): FrameRow[];
/** The frame as plain text lines. This is what the snapshot tests assert on. */
export declare function frameToPlain(rows: FrameRow[]): string[];
/** Applies color to a row. Called only at paint time, so the renderer stays testable. */
export declare function styleRow(row: FrameRow): string;
export type DemoStage = {
    update(patch: Partial<DemoState>): void;
    fail(message: string, fix?: string, logPath?: string): void;
    finish(done: DemoDone): void;
    /** Stops the repaint timer and leaves the last frame on screen. */
    stop(): void;
};
/**
 * Paints the frame in place.
 *
 * Each paint clears and rewrites the same {@link FRAME_ROWS} lines and then walks the cursor
 * back, so the frame never scrolls. A terminal without a TTY gets one plain line per phase
 * change instead, because an animated frame is meaningless in a piped log.
 */
export declare function createDemoStage(initial: DemoState, stream?: NodeJS.WriteStream, now?: () => number): DemoStage;
export {};
