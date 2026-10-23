// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import chalk from "chalk";

import { stripTerminalControls } from "./tilt-events.js";

/**
 * Rows the frame always occupies.
 *
 * A fixed height is what keeps the terminal from scrolling, which matters most when the
 * demo is recorded: a frame that grows pushes everything off the screen.
 */
export const FRAME_ROWS = 12;

/** The narrowest frame that still reads. Below this the labels are truncated to nothing. */
const MIN_FRAME_WIDTH = 24;

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
  failure?: { message: string; fix?: string; logPath?: string };
  done?: DemoDone;
};

type Style = "plain" | "bold" | "dim" | "ok" | "warn" | "err";

export type Segment = { text: string; style: Style };

export type FrameRow = Segment[];

const STYLES: Record<Style, (text: string) => string> = {
  plain: (text) => text,
  bold: chalk.bold,
  dim: chalk.gray,
  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
};

/**
 * State glyphs, so the frame still reads in a terminal without color and in a grayscale
 * video encode. Color never carries the only signal.
 */
const GLYPH: Record<DemoPhaseStatus, string> = {
  pending: "○",
  active: "◐",
  done: "✔",
  failed: "✖",
};

const GLYPH_STYLE: Record<DemoPhaseStatus, Style> = {
  pending: "dim",
  active: "warn",
  done: "ok",
  failed: "err",
};

/**
 * Control characters, including ESC, are removed from every value that reaches the frame.
 *
 * A repo name or an error line from git can carry ANSI sequences. Painted verbatim they
 * can move the cursor and shred a fixed frame, which on a recording looks like the tool broke.
 * A newline is flattened too: every cell is exactly one row tall.
 */
export function sanitizeCell(value: string): string {
  return stripTerminalControls(String(value)).replace(/[\n\r\t]/g, " ");
}

/** `0.9s`, `12.4s`, `1m 12s`. Short enough to sit in a right-aligned column. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function plainLength(row: FrameRow): number {
  return row.reduce((total, segment) => total + segment.text.length, 0);
}

/** Cuts a row to `max` characters, keeping whole segments and ellipsizing the one that straddles. */
function truncateRow(row: FrameRow, max: number): FrameRow {
  if (max <= 0) return [];
  const kept: FrameRow = [];
  let used = 0;
  for (const segment of row) {
    if (used >= max) break;
    const room = max - used;
    if (segment.text.length <= room) {
      kept.push(segment);
      used += segment.text.length;
      continue;
    }
    kept.push({ ...segment, text: `${segment.text.slice(0, Math.max(0, room - 1))}…` });
    used = max;
  }
  return kept;
}

function padRow(row: FrameRow, width: number): FrameRow {
  const clipped = truncateRow(row, width);
  const padding = width - plainLength(clipped);
  if (padding <= 0) return clipped;
  return [...clipped, { text: " ".repeat(padding), style: "plain" }];
}

/** Left content, right-aligned content, spaces between. The label gives way first. */
function splitRow(left: FrameRow, right: FrameRow, width: number): FrameRow {
  const rightLength = plainLength(right);
  const room = width - rightLength - 1;
  if (room < 4) return padRow(truncateRow([...left, ...right], width), width);
  const clippedLeft = truncateRow(left, room);
  const gap = width - plainLength(clippedLeft) - rightLength;
  return [...clippedLeft, { text: " ".repeat(Math.max(1, gap)), style: "plain" }, ...right];
}

function rule(width: number): FrameRow {
  return [{ text: ` ${"─".repeat(Math.max(0, width - 2))}`, style: "dim" }];
}

function phaseRow(phase: DemoPhase, width: number): FrameRow {
  return splitRow(
    [
      { text: " ", style: "plain" },
      { text: GLYPH[phase.status], style: GLYPH_STYLE[phase.status] },
      { text: "  ", style: "plain" },
      { text: sanitizeCell(phase.label), style: phase.status === "pending" ? "dim" : "plain" },
    ],
    phase.elapsedMs === undefined ? [] : [{ text: formatElapsed(phase.elapsedMs), style: "dim" }],
    width,
  );
}

function servicesLine(state: DemoState): string {
  const total = Math.max(0, state.servicesTotal);
  if (total === 0) return "no services found";
  const ready = Math.min(Math.max(0, state.servicesReady), total);
  const parts = [`${ready} of ${total} services ready`];
  if (state.servicesBuilding > 0) parts.push(`${state.servicesBuilding} building`);
  return parts.join(" · ");
}

/**
 * Builds the frame as plain segments. No I/O, no clock, no terminal size.
 *
 * Keeping this pure is what makes the transcript snapshot-testable and the recording
 * deterministic: the same state always paints the same twelve rows.
 */
export function renderDemoFrame(state: DemoState, columns = 80): FrameRow[] {
  // A pseudo-terminal can report 0 columns before the first resize. That is "unknown",
  // not a tiny terminal, so it falls back to 80 instead of the minimum width.
  const reported = Number.isFinite(columns) && columns > 0 ? columns : 80;
  const width = Math.max(MIN_FRAME_WIDTH, Math.min(reported - 1, 78));
  const rows: FrameRow[] = [];
  const push = (row: FrameRow) => rows.push(padRow(row, width));
  const blank = () => push([]);

  if (state.done) {
    push(
      splitRow(
        [
          { text: " ", style: "plain" },
          { text: "✔", style: "ok" },
          { text: "  Your stack is running", style: "ok" },
        ],
        [{ text: formatElapsed(state.elapsedMs), style: "dim" }],
        width,
      ),
    );
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.subtitle), style: "dim" },
    ]);
    blank();
    for (const url of state.done.urls.slice(0, 2)) {
      push([
        { text: "     ", style: "plain" },
        { text: sanitizeCell(url), style: "plain" },
      ]);
    }
    blank();
    push(rule(width));
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.done.summary), style: "plain" },
    ]);
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.done.hint), style: "dim" },
    ]);
    blank();
    push([
      { text: " ", style: "plain" },
      { text: `flisk ${sanitizeCell(state.done.version)}`, style: "dim" },
    ]);
  } else if (state.failure) {
    const failed = state.phases.find((phase) => phase.status === "failed");
    push(
      splitRow(
        [
          { text: " ", style: "plain" },
          { text: "✖", style: "err" },
          { text: "  ", style: "plain" },
          { text: sanitizeCell(failed?.label ?? "The demo stopped"), style: "err" },
        ],
        [{ text: formatElapsed(state.elapsedMs), style: "dim" }],
        width,
      ),
    );
    blank();
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.failure.message), style: "plain" },
    ]);
    if (state.failure.fix) {
      push([
        { text: " ", style: "plain" },
        { text: sanitizeCell(state.failure.fix), style: "dim" },
      ]);
    }
    blank();
    push(rule(width));
    if (state.detail) {
      push([
        { text: " ", style: "plain" },
        { text: sanitizeCell(state.detail), style: "dim" },
      ]);
    }
    if (state.failure.logPath) {
      push([
        { text: " ", style: "plain" },
        { text: `log: ${sanitizeCell(state.failure.logPath)}`, style: "dim" },
      ]);
    }
  } else {
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.title), style: "bold" },
    ]);
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.subtitle), style: "dim" },
    ]);
    blank();
    const visible = state.phases.slice(0, 4);
    for (const phase of visible) push(phaseRow(phase, width));
    for (let index = visible.length; index < 4; index += 1) blank();
    blank();
    push(rule(width));
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.detail ?? ""), style: "dim" },
    ]);
    push(
      splitRow(
        [
          { text: " ", style: "plain" },
          { text: servicesLine(state), style: "plain" },
        ],
        [{ text: formatElapsed(state.elapsedMs), style: "dim" }],
        width,
      ),
    );
  }

  while (rows.length < FRAME_ROWS) rows.push(padRow([], width));
  return rows.slice(0, FRAME_ROWS);
}

/** The frame as plain text lines. This is what the snapshot tests assert on. */
export function frameToPlain(rows: FrameRow[]): string[] {
  return rows.map((row) => row.map((segment) => segment.text).join(""));
}

/** Applies color to a row. Called only at paint time, so the renderer stays testable. */
export function styleRow(row: FrameRow): string {
  return row.map((segment) => STYLES[segment.style](segment.text)).join("");
}

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
export function createDemoStage(
  initial: DemoState,
  stream: NodeJS.WriteStream = process.stderr,
  now: () => number = Date.now,
): DemoStage {
  const animate = stream.isTTY === true;
  const startedAt = now();
  let state: DemoState = { ...initial };
  let painted = false;
  let lastFrame = "";
  let lastPlainSignature = "";
  let timer: NodeJS.Timeout | undefined;

  const snapshot = (): DemoState => {
    const finished = Boolean(state.done || state.failure);
    return {
      ...state,
      elapsedMs: finished ? state.elapsedMs : now() - startedAt,
    };
  };

  const paint = () => {
    const current = snapshot();
    const rows = renderDemoFrame(current, stream.columns ?? 80);
    const plain = frameToPlain(rows);

    if (!animate) {
      const signature = plain.join("\n");
      if (signature === lastPlainSignature) return;
      lastPlainSignature = signature;
      stream.write(`${plain.filter((line) => line.trim() !== "").join("\n")}\n`);
      return;
    }

    const frame = plain.join("\n");
    if (frame === lastFrame && painted) return;
    lastFrame = frame;
    // Walk back to the first row of the previous paint, then clear and rewrite each line.
    if (painted) stream.write(`\x1b[${FRAME_ROWS}A`);
    for (const row of rows) stream.write(`\r\x1b[2K${styleRow(row)}\n`);
    painted = true;
  };

  if (animate) {
    paint();
    timer = setInterval(paint, 200);
    // The frame must never be the reason a finished demo keeps the process alive.
    timer.unref?.();
  }

  return {
    update(patch) {
      state = { ...state, ...patch, phases: patch.phases ?? state.phases };
      paint();
    },
    fail(message, fix, logPath) {
      state = {
        ...state,
        elapsedMs: now() - startedAt,
        failure: { message, fix, logPath },
        phases: state.phases.map((phase) =>
          phase.status === "active" ? { ...phase, status: "failed" as const } : phase,
        ),
      };
      paint();
    },
    finish(done) {
      state = { ...state, elapsedMs: now() - startedAt, done };
      paint();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
