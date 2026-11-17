import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  CLI_REPOSITORY
} from "./chunk-UJEJFGPG.js";
import {
  stripTerminalControls
} from "./chunk-E57RI6CK.js";
import {
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/demo-stage.js
var FRAME_ROWS = 12;
var DEMO_STAR_URL = CLI_REPOSITORY.replace(/^https:\/\//, "");
var DEMO_DISCORD_URL = "discord.gg/qMu5Xn8Kaq";
var DEMO_PROOF = "MIT \xB7 no telemetry \xB7 signed release: docs/security.md";
var MIN_FRAME_WIDTH = 24;
var STYLES = {
  plain: (text) => text,
  bold: source_default.bold,
  dim: source_default.gray,
  ok: source_default.green,
  warn: source_default.yellow,
  err: source_default.red
};
var GLYPH = {
  pending: "\u25CB",
  active: "\u25D0",
  done: "\u2714",
  failed: "\u2716"
};
var GLYPH_STYLE = {
  pending: "dim",
  active: "warn",
  done: "ok",
  failed: "err"
};
function sanitizeCell(value) {
  return stripTerminalControls(String(value)).replace(/[\n\r\t]/g, " ");
}
function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0)
    return "0.0s";
  if (ms < 1e4)
    return `${(ms / 1e3).toFixed(1)}s`;
  if (ms < 6e4)
    return `${Math.round(ms / 1e3)}s`;
  const minutes = Math.floor(ms / 6e4);
  const seconds = Math.round(ms % 6e4 / 1e3);
  return `${minutes}m ${seconds}s`;
}
function plainLength(row) {
  return row.reduce((total, segment) => total + segment.text.length, 0);
}
function truncateRow(row, max) {
  if (max <= 0)
    return [];
  const kept = [];
  let used = 0;
  for (const segment of row) {
    if (used >= max)
      break;
    const room = max - used;
    if (segment.text.length <= room) {
      kept.push(segment);
      used += segment.text.length;
      continue;
    }
    kept.push({ ...segment, text: `${segment.text.slice(0, Math.max(0, room - 1))}\u2026` });
    used = max;
  }
  return kept;
}
function padRow(row, width) {
  const clipped = truncateRow(row, width);
  const padding = width - plainLength(clipped);
  if (padding <= 0)
    return clipped;
  return [...clipped, { text: " ".repeat(padding), style: "plain" }];
}
function splitRow(left, right, width) {
  const rightLength = plainLength(right);
  const room = width - rightLength - 1;
  if (room < 4)
    return padRow(truncateRow([...left, ...right], width), width);
  const clippedLeft = truncateRow(left, room);
  const gap = width - plainLength(clippedLeft) - rightLength;
  return [...clippedLeft, { text: " ".repeat(Math.max(1, gap)), style: "plain" }, ...right];
}
function rule(width) {
  return [{ text: ` ${"\u2500".repeat(Math.max(0, width - 2))}`, style: "dim" }];
}
function phaseRow(phase, width) {
  return splitRow([
    { text: " ", style: "plain" },
    { text: GLYPH[phase.status], style: GLYPH_STYLE[phase.status] },
    { text: "  ", style: "plain" },
    { text: sanitizeCell(phase.label), style: phase.status === "pending" ? "dim" : "plain" }
  ], phase.elapsedMs === void 0 ? [] : [{ text: formatElapsed(phase.elapsedMs), style: "dim" }], width);
}
function servicesLine(state) {
  const total = Math.max(0, state.servicesTotal);
  if (total === 0)
    return "no services found";
  const ready = Math.min(Math.max(0, state.servicesReady), total);
  const parts = [`${ready} of ${total} services ready`];
  if (state.servicesBuilding > 0)
    parts.push(`${state.servicesBuilding} building`);
  if (state.servicesPhase)
    parts.push(state.servicesPhase);
  return parts.join(" \xB7 ");
}
function renderDemoFrame(state, columns = 80) {
  const reported = Number.isFinite(columns) && columns > 0 ? columns : 80;
  const width = Math.max(MIN_FRAME_WIDTH, Math.min(reported - 1, 78));
  const rows = [];
  const push = (row) => rows.push(padRow(row, width));
  const blank = () => push([]);
  if (state.done) {
    push(splitRow([
      { text: " ", style: "plain" },
      { text: "\u2714", style: "ok" },
      { text: "  Your stack is running", style: "ok" }
    ], [{ text: formatElapsed(state.elapsedMs), style: "dim" }], width));
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.subtitle), style: "dim" }
    ]);
    blank();
    for (const url of state.done.urls.slice(0, 2)) {
      push([
        { text: "     ", style: "plain" },
        { text: sanitizeCell(url), style: "plain" }
      ]);
    }
    blank();
    push(rule(width));
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.done.summary), style: "plain" }
    ]);
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.done.hint), style: "dim" }
    ]);
    if (!state.done.discordUrl)
      blank();
    push([
      { text: " ", style: "plain" },
      { text: `flisk ${sanitizeCell(state.done.version)} \xB7 ${DEMO_PROOF}`, style: "dim" }
    ]);
    if (state.done.discordUrl) {
      push([
        { text: " ", style: "plain" },
        {
          text: `Questions? Join us on Discord: ${sanitizeCell(state.done.discordUrl)}`,
          style: "dim"
        }
      ]);
    }
    if (state.done.starUrl) {
      push([
        { text: " ", style: "plain" },
        { text: `Like it? A star helps: ${sanitizeCell(state.done.starUrl)}`, style: "dim" }
      ]);
    }
  } else if (state.failure) {
    const failed = state.phases.find((phase) => phase.status === "failed");
    push(splitRow([
      { text: " ", style: "plain" },
      { text: "\u2716", style: "err" },
      { text: "  ", style: "plain" },
      { text: sanitizeCell(failed?.label ?? "The demo stopped"), style: "err" }
    ], [{ text: formatElapsed(state.elapsedMs), style: "dim" }], width));
    blank();
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.failure.message), style: "plain" }
    ]);
    if (state.failure.fix) {
      push([
        { text: " ", style: "plain" },
        { text: sanitizeCell(state.failure.fix), style: "dim" }
      ]);
    }
    blank();
    push(rule(width));
    if (state.detail) {
      push([
        { text: " ", style: "plain" },
        { text: sanitizeCell(state.detail), style: "dim" }
      ]);
    }
    if (state.failure.logPath) {
      push([
        { text: " ", style: "plain" },
        { text: `log: ${sanitizeCell(state.failure.logPath)}`, style: "dim" }
      ]);
    }
  } else {
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.title), style: "bold" }
    ]);
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.subtitle), style: "dim" }
    ]);
    blank();
    const visible = state.phases.slice(0, 4);
    for (const phase of visible)
      push(phaseRow(phase, width));
    for (let index = visible.length; index < 4; index += 1)
      blank();
    blank();
    push(rule(width));
    push([
      { text: " ", style: "plain" },
      { text: sanitizeCell(state.detail ?? ""), style: "dim" }
    ]);
    push(splitRow([
      { text: " ", style: "plain" },
      { text: servicesLine(state), style: "plain" }
    ], [{ text: formatElapsed(state.elapsedMs), style: "dim" }], width));
  }
  while (rows.length < FRAME_ROWS)
    rows.push(padRow([], width));
  return rows.slice(0, FRAME_ROWS);
}
function frameToPlain(rows) {
  return rows.map((row) => row.map((segment) => segment.text).join(""));
}
function styleRow(row) {
  return row.map((segment) => STYLES[segment.style](segment.text)).join("");
}
function createDemoStage(initial, stream = process.stderr, now = Date.now) {
  const animate = stream.isTTY === true;
  const startedAt = now();
  let state = { ...initial };
  let painted = false;
  let lastFrame = "";
  let lastPlainSignature = "";
  let timer;
  const snapshot = () => {
    const finished = Boolean(state.done || state.failure);
    return {
      ...state,
      elapsedMs: finished ? state.elapsedMs : now() - startedAt
    };
  };
  const paint = () => {
    const current = snapshot();
    const rows = renderDemoFrame(current, stream.columns ?? 80);
    const plain = frameToPlain(rows);
    if (!animate) {
      const signature = plain.join("\n");
      if (signature === lastPlainSignature)
        return;
      lastPlainSignature = signature;
      stream.write(`${plain.filter((line) => line.trim() !== "").join("\n")}
`);
      return;
    }
    const frame = plain.join("\n");
    if (frame === lastFrame && painted)
      return;
    lastFrame = frame;
    if (painted)
      stream.write(`\x1B[${FRAME_ROWS}A`);
    for (const row of rows)
      stream.write(`\r\x1B[2K${styleRow(row)}
`);
    painted = true;
  };
  if (animate) {
    paint();
    timer = setInterval(paint, 200);
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
        phases: state.phases.map((phase) => phase.status === "active" ? { ...phase, status: "failed" } : phase)
      };
      paint();
    },
    finish(done) {
      const isPerson = animate && !process.env.CI;
      const starUrl = isPerson ? DEMO_STAR_URL : void 0;
      const discordUrl = isPerson ? DEMO_DISCORD_URL : void 0;
      state = { ...state, elapsedMs: now() - startedAt, done: { ...done, starUrl, discordUrl } };
      paint();
    },
    stop() {
      if (timer)
        clearInterval(timer);
      timer = void 0;
    }
  };
}

export {
  FRAME_ROWS,
  DEMO_STAR_URL,
  DEMO_DISCORD_URL,
  DEMO_PROOF,
  sanitizeCell,
  formatElapsed,
  renderDemoFrame,
  frameToPlain,
  styleRow,
  createDemoStage
};
