import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/latest-version.js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
var LATEST_VERSION_URL = "https://registry.npmjs.org/@flisk-sh%2fflisk/latest";
var LATEST_VERSION_TIMEOUT_MS = 800;
var LATEST_VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var LATEST_VERSION_CACHE_FILE = "latest-version.json";
function parseParts(raw) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
function isOlderVersion(current, latest) {
  const left = parseParts(current);
  const right = parseParts(latest);
  if (!left || !right)
    return false;
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0)
      return difference < 0;
  }
  return false;
}
function isLatestVersionCheckSkipped(env = process.env, argv = process.argv) {
  const isSet = (value) => value !== void 0 && value !== "" && value !== "0" && value.toLowerCase() !== "false";
  return isSet(env.CI) || isSet(env.FLISK_OFFLINE) || isSet(env.NO_UPDATE_NOTIFIER) || argv.includes("--offline");
}
function readCache(path, now) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed !== "object" || parsed === null)
      return null;
    const { version, checkedAt } = parsed;
    if (typeof version !== "string" || typeof checkedAt !== "number")
      return null;
    if (now - checkedAt < 0 || now - checkedAt >= LATEST_VERSION_CACHE_TTL_MS)
      return null;
    return parseParts(version) ? version : null;
  } catch {
    return null;
  }
}
async function fetchLatestVersion(options = {}) {
  const env = options.env ?? process.env;
  if (isLatestVersionCheckSkipped(env, options.argv ?? process.argv))
    return null;
  const now = options.now ?? Date.now();
  const cacheDir = options.cacheDir ?? join(homedir(), ".flisk");
  const cachePath = join(cacheDir, LATEST_VERSION_CACHE_FILE);
  const cached = readCache(cachePath, now);
  if (cached)
    return cached;
  const timeoutMs = options.timeoutMs ?? LATEST_VERSION_TIMEOUT_MS;
  let timer;
  try {
    const controller = new AbortController();
    const request = (async () => {
      const response = await (options.fetchImpl ?? fetch)(LATEST_VERSION_URL, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok)
        return null;
      const body = await response.json();
      return typeof body.version === "string" && parseParts(body.version) ? body.version : null;
    })();
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const version = await Promise.race([request.catch(() => null), deadline]);
    if (version) {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cachePath, JSON.stringify({ version, checkedAt: now }));
      } catch {
      }
    }
    return version;
  } catch {
    return null;
  } finally {
    if (timer)
      clearTimeout(timer);
  }
}
function describeInstallLocation(scriptPath = process.argv[1], home = homedir()) {
  if (!scriptPath)
    return null;
  const marker = `${sep}node_modules${sep}`;
  const index = scriptPath.lastIndexOf(marker);
  if (index <= 0)
    return null;
  const root = scriptPath.slice(0, index + marker.length - 1);
  return home && root.startsWith(home) ? `~${root.slice(home.length)}` : root;
}
function formatStaleVersionNotice(current, latest, location, command = "npx @flisk-sh/flisk@latest demo") {
  const from = location ? ` from ${location}` : "";
  return `You are running flisk ${current}${from}; ${latest} is out. Run: ${command}`;
}
async function staleVersionNotice(current, options = {}) {
  const latest = await fetchLatestVersion(options);
  if (!latest || !isOlderVersion(current, latest))
    return null;
  return formatStaleVersionNotice(current, latest, describeInstallLocation(options.scriptPath), options.command);
}

export {
  LATEST_VERSION_URL,
  LATEST_VERSION_TIMEOUT_MS,
  LATEST_VERSION_CACHE_TTL_MS,
  LATEST_VERSION_CACHE_FILE,
  isOlderVersion,
  isLatestVersionCheckSkipped,
  fetchLatestVersion,
  describeInstallLocation,
  formatStaleVersionNotice,
  staleVersionNotice
};
