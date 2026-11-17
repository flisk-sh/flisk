import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  parseSizeToBytes
} from "./chunk-X45DIH6R.js";
import {
  checkColima
} from "./chunk-QRGFABNE.js";
import {
  FliskError
} from "./chunk-73W4Y4TI.js";

// dist/utils/colima-disk.js
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
var execFilePromise = promisify(execFile);
var GIB = 1024 ** 3;
var COLIMA_DISK_CHECK = "Colima Disk";
var COLIMA_DISK_RATIO = 3;
var COLIMA_DISK_MIN_GAP_GIB = 5;
var COLIMA_TRIM_COMMAND = "colima ssh -- sudo fstrim -av";
function colimaDiskPath(home = homedir()) {
  return join(home, ".lima", "_disks", "colima", "datadisk");
}
function readColimaDiskFileBytes(path = colimaDiskPath()) {
  try {
    const stat = statSync(path);
    return stat.blocks * 512;
  } catch {
    return null;
  }
}
function sumDockerUsageBytes(dfOutput) {
  let total = 0;
  for (const line of dfOutput.split(/\r?\n/)) {
    const parts = line.split("	");
    if (parts.length < 3)
      continue;
    total += parseSizeToBytes((parts[2] ?? "").trim());
  }
  return total;
}
function defaultColimaDiskDeps() {
  return {
    diskFileBytes: () => readColimaDiskFileBytes(),
    dockerDf: async () => {
      const { stdout } = await execFilePromise("docker", ["system", "df", "--format", "{{.Type}}	{{.TotalCount}}	{{.Size}}	{{.Reclaimable}}"], { encoding: "utf-8", timeout: 15e3, windowsHide: true });
      return stdout;
    },
    colimaStatus: () => checkColima()
  };
}
function formatBytes(bytes) {
  return bytes >= GIB ? `${(bytes / GIB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
function isColimaDiskBloated(report) {
  return report.diskFileBytes - report.dockerBytes >= COLIMA_DISK_MIN_GAP_GIB * GIB && (report.dockerBytes === 0 || report.diskFileBytes > report.dockerBytes * COLIMA_DISK_RATIO);
}
async function readColimaDisk(deps = defaultColimaDiskDeps()) {
  const colima = deps.colimaStatus();
  if (!colima.isColima || !colima.running)
    return null;
  const diskFileBytes = deps.diskFileBytes();
  if (diskFileBytes === null)
    return null;
  try {
    const dockerBytes = sumDockerUsageBytes(await deps.dockerDf());
    return {
      diskFileBytes,
      dockerBytes,
      ratio: dockerBytes > 0 ? diskFileBytes / dockerBytes : null
    };
  } catch {
    return null;
  }
}
async function checkColimaDisk(deps = defaultColimaDiskDeps()) {
  const report = await readColimaDisk(deps);
  if (!report) {
    return {
      name: COLIMA_DISK_CHECK,
      didPass: true,
      isSkipped: true,
      message: "Docker does not run on a Colima VM, or its disk file could not be read"
    };
  }
  const summary = `disk file ${formatBytes(report.diskFileBytes)} on the Mac, Docker uses ${formatBytes(report.dockerBytes)}`;
  if (isColimaDiskBloated(report)) {
    return {
      name: COLIMA_DISK_CHECK,
      didPass: false,
      isWarning: true,
      message: `${summary}: the disk file only shrinks when the VM is trimmed`,
      fix: `Run flisk doctor --fix (or ${COLIMA_TRIM_COMMAND}) to give the space back to the Mac`,
      colimaDisk: report
    };
  }
  return { name: COLIMA_DISK_CHECK, didPass: true, message: summary, colimaDisk: report };
}
var runColimaTrim = async () => {
  try {
    await execFilePromise("colima", ["ssh", "--", "sudo", "fstrim", "-av"], {
      encoding: "utf-8",
      timeout: 3e5,
      windowsHide: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FliskError(message.split(/\r?\n/)[0] ?? message, [
      `Run it by hand: ${COLIMA_TRIM_COMMAND}`,
      "Check the container engine with: flisk doctor"
    ]);
  }
};
async function trimColimaAndMeasure(options = {}) {
  const status = options.status ?? checkColima();
  if (!status.isColima || !status.running)
    return null;
  const read = options.diskFileBytes ?? (() => readColimaDiskFileBytes());
  const before = read();
  await (options.trim ?? runColimaTrim)();
  const after = read();
  const returnedBytes = before !== null && after !== null ? Math.max(0, before - after) : 0;
  return { returnedBytes, before, after };
}

export {
  formatBytes,
  isColimaDiskBloated,
  readColimaDisk,
  checkColimaDisk,
  runColimaTrim,
  trimColimaAndMeasure
};
