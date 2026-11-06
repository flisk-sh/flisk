import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  CLI_REPOSITORY
} from "./chunk-MQVSHG45.js";
import {
  FliskError,
  STANDARD_PORTS,
  runTilt,
  source_default
} from "./chunk-NKTINEF4.js";

// dist/utils/tilt-events.js
var TILT_UNAVAILABLE_HELP = ["Start the stack with: flisk up", "Check Tilt with: flisk doctor"];
var TILT_ERROR_HELP = [
  "Check Tilt with: flisk doctor",
  "Compare the Tilt version with: tilt version"
];
var TiltEventsLoadError = class extends FliskError {
  kind;
  constructor(message, kind, suggestions = []) {
    super(message, suggestions);
    this.kind = kind;
    this.name = "TiltEventsLoadError";
  }
};
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
var ESC = String.fromCharCode(27);
var BEL = String.fromCharCode(7);
var ANSI_SEQUENCE = new RegExp(`${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|[@-Z\\\\-_])`, "g");
var CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]", "g");
function stripTerminalControls(value) {
  return value.replace(ANSI_SEQUENCE, "").replace(CONTROL_CHARS, "");
}
function readString(value) {
  if (typeof value !== "string")
    return void 0;
  const cleaned = stripTerminalControls(value).trim();
  return cleaned || void 0;
}
function readStringArray(value) {
  return Array.isArray(value) ? value.flatMap((item) => {
    const cleaned = readString(item);
    return cleaned ? [cleaned] : [];
  }) : [];
}
function parseTiltUiResourceList(value) {
  const list = asRecord(value);
  if (!list || !Array.isArray(list.items)) {
    throw new FliskError("Tilt returned an invalid UIResource list", TILT_ERROR_HELP);
  }
  const resources = [];
  const events = [];
  for (const value2 of list.items) {
    const item = asRecord(value2);
    const metadata = asRecord(item?.metadata);
    const resourceName = readString(metadata?.name);
    if (!item || !resourceName)
      continue;
    const status = asRecord(item.status);
    resources.push({
      name: resourceName,
      runtimeStatus: readString(status?.runtimeStatus),
      updateStatus: readString(status?.updateStatus),
      hasPendingChanges: typeof status?.hasPendingChanges === "boolean" ? status.hasPendingChanges : void 0
    });
    const history = Array.isArray(status?.buildHistory) ? status.buildHistory : [];
    for (const [buildIndex, value3] of history.entries()) {
      const build = asRecord(value3);
      if (!build)
        continue;
      const error = readString(build.error);
      const warnings = readStringArray(build.warnings);
      const details = [error, ...warnings].filter((entry) => Boolean(entry));
      const spanId = readString(build.spanID);
      let kind = "success";
      let title = "Build completed";
      if (error) {
        kind = "failed";
        title = "Build failed";
      } else if (warnings.length > 0) {
        kind = "warning";
        title = "Build completed with warnings";
      }
      events.push({
        id: `${resourceName}:build:${spanId ?? String(buildIndex)}`,
        resourceName,
        kind,
        title,
        occurredAt: readString(build.finishTime) ?? readString(build.startTime),
        details: details.length ? details.join("; ") : void 0
      });
    }
    const currentBuild = asRecord(status?.currentBuild);
    if (currentBuild) {
      events.push({
        id: `${resourceName}:current-build`,
        resourceName,
        kind: "running",
        title: "Build in progress",
        occurredAt: readString(currentBuild.startTime)
      });
    }
    const pendingSince = readString(status?.pendingBuildSince);
    if (!currentBuild && (status?.queued === true || pendingSince)) {
      events.push({
        id: `${resourceName}:queued`,
        resourceName,
        kind: "warning",
        title: "Update queued",
        occurredAt: pendingSince
      });
    }
    const lastDeployTime = readString(status?.lastDeployTime);
    const deployTimestamp = lastDeployTime ? Date.parse(lastDeployTime) : Number.NaN;
    const matchingBuild = events.some((event) => event.resourceName === resourceName && event.kind === "success" && event.occurredAt !== void 0 && Date.parse(event.occurredAt) === deployTimestamp);
    if (lastDeployTime && !matchingBuild) {
      events.push({
        id: `${resourceName}:last-deploy`,
        resourceName,
        kind: "success",
        title: "Last deployed",
        occurredAt: lastDeployTime
      });
    }
    const conditions = Array.isArray(status?.conditions) ? status.conditions : [];
    for (const [conditionIndex, value3] of conditions.entries()) {
      const condition = asRecord(value3);
      if (!condition)
        continue;
      const type = readString(condition.type);
      const state = readString(condition.status);
      const reason = readString(condition.reason);
      const message = readString(condition.message);
      if (!type && !reason && !message || state === "True" && !reason && !message)
        continue;
      const detail = [reason, message].filter((entry) => Boolean(entry)).join(": ");
      events.push({
        id: `${resourceName}:condition:${conditionIndex}:${type ?? "status"}`,
        resourceName,
        kind: state === "False" ? "warning" : "status",
        title: `Condition ${type ?? "status"}${state ? `: ${state}` : ""}`,
        occurredAt: readString(condition.lastTransitionTime),
        details: detail || void 0
      });
    }
  }
  events.sort((left, right) => {
    if (left.kind === "running" && right.kind !== "running")
      return -1;
    if (right.kind === "running" && left.kind !== "running")
      return 1;
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.NaN;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.NaN;
    if (Number.isNaN(leftTime)) {
      return Number.isNaN(rightTime) ? left.resourceName.localeCompare(right.resourceName) : 1;
    }
    if (Number.isNaN(rightTime))
      return -1;
    return rightTime - leftTime;
  });
  return { resources, events };
}
async function loadTiltEvents() {
  const port = process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
  let result;
  try {
    result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
      inheritStdio: false,
      timeoutMs: 1e4
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = /ENOENT|not found|no such file|connection refused|failed to connect|could not connect|unable to connect|Tilt is not running/i.test(message) ? "unavailable" : "error";
    throw new TiltEventsLoadError(message, kind, kind === "unavailable" ? TILT_UNAVAILABLE_HELP : TILT_ERROR_HELP);
  }
  if (result.exitCode !== 0) {
    const message = result.stderr.trim() || `tilt get exited with code ${result.exitCode}`;
    const kind = /connection refused|failed to connect|could not connect|unable to connect|Tilt is not running|no running Tilt/i.test(message) ? "unavailable" : "error";
    throw new TiltEventsLoadError(message, kind, kind === "unavailable" ? TILT_UNAVAILABLE_HELP : TILT_ERROR_HELP);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new TiltEventsLoadError("Tilt returned invalid UIResource JSON", "error", TILT_ERROR_HELP);
  }
  try {
    return parseTiltUiResourceList(parsed);
  } catch (error) {
    throw new TiltEventsLoadError(error instanceof Error ? error.message : "Tilt returned an invalid UIResource list", "error", TILT_ERROR_HELP);
  }
}

// dist/utils/demo-stage.js
var FRAME_ROWS = 12;
var DEMO_STAR_URL = CLI_REPOSITORY.replace(/^https:\/\//, "");
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
    blank();
    push([
      { text: " ", style: "plain" },
      { text: `flisk ${sanitizeCell(state.done.version)}`, style: "dim" }
    ]);
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
      const starUrl = animate && !process.env.CI ? DEMO_STAR_URL : void 0;
      state = { ...state, elapsedMs: now() - startedAt, done: { ...done, starUrl } };
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
  TiltEventsLoadError,
  stripTerminalControls,
  loadTiltEvents,
  FRAME_ROWS,
  DEMO_STAR_URL,
  sanitizeCell,
  formatElapsed,
  renderDemoFrame,
  frameToPlain,
  styleRow,
  createDemoStage
};
