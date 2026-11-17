import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/tilt-logs.js
var DEFAULT_LOG_TAIL = 200;
var MAX_LOG_TAIL = 1e4;
var NANOSECONDS = {
  ns: 1,
  us: 1e3,
  \u00B5s: 1e3,
  ms: 1e6,
  s: 1e9,
  m: 6e10,
  h: 36e11
};
var MAX_DURATION_NANOSECONDS = 2 ** 63 - 1;
function isValidSince(value) {
  if (!/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(value))
    return false;
  let total = 0;
  for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
    total += Number(amount) * (NANOSECONDS[unit] ?? 0);
  }
  return total <= MAX_DURATION_NANOSECONDS;
}
function sinceMilliseconds(value) {
  let total = 0;
  for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
    total += Number(amount) * (NANOSECONDS[unit] ?? 0);
  }
  return total / 1e6;
}
function isValidTail(value) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= MAX_LOG_TAIL;
}
function parseTiltLogLines(output, limit) {
  const lines = [];
  for (const raw of output.split("\n")) {
    if (!raw.trim())
      continue;
    try {
      const entry = JSON.parse(raw);
      const str = (value) => typeof value === "string" && value !== "" ? value : null;
      lines.push({
        time: str(entry.time),
        resource: str(entry.resource),
        level: str(entry.level),
        source: str(entry.source),
        text: typeof entry.message === "string" ? entry.message : ""
      });
    } catch {
    }
  }
  return lines.slice(-limit);
}
var LOG_SOURCES = ["runtime", "build"];
function isValidLogSource(value) {
  return LOG_SOURCES.includes(value);
}
function filterLogSource(lines, source) {
  return lines.filter((line) => line.source === "build" === (source === "build"));
}
function isTiltConnectionFailure(stderr) {
  return /connection refused|connecting to Tilt|no such host|dial tcp|websocket_token/i.test(stderr);
}

// dist/utils/tilt-unreachable-message.js
function tiltUnreachableMessage(port) {
  return `Could not reach Tilt on port ${port}. The stack is not running, or Tilt is on another port. Start it with: flisk up`;
}

export {
  DEFAULT_LOG_TAIL,
  MAX_LOG_TAIL,
  isValidSince,
  sinceMilliseconds,
  isValidTail,
  parseTiltLogLines,
  LOG_SOURCES,
  isValidLogSource,
  filterLogSource,
  isTiltConnectionFailure,
  tiltUnreachableMessage
};
