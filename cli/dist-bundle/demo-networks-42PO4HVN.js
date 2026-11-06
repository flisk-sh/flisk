import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  applyDoctorFixes,
  planDoctorFixes
} from "./chunk-EF3K7OGW.js";
import "./chunk-IXI5AKZB.js";
import "./chunk-IZ7YHIUT.js";
import "./chunk-KZQVEXPY.js";
import "./chunk-NKTINEF4.js";
import "./chunk-M5PYRDUN.js";
import "./chunk-5PPZSBJD.js";
import "./chunk-HS5H5D2L.js";
import "./chunk-VVP2Y2AJ.js";

// dist/utils/demo-networks.js
import { execFileSync } from "node:child_process";
var POOL_EXHAUSTED = /all predefined address pools have been fully subnetted/i;
var dockerDeps = {
  probe() {
    const name = `flisk_demo_probe_${process.pid}`;
    try {
      execFileSync("docker", ["network", "create", name], { stdio: "pipe", timeout: 3e4 });
    } catch (err) {
      return String(err.stderr ?? err).trim();
    }
    try {
      execFileSync("docker", ["network", "rm", name], { stdio: "pipe", timeout: 3e4 });
    } catch {
    }
    return null;
  },
  planUnused: () => planDoctorFixes(void 0, void 0, { machine: true }),
  apply: (actions) => applyDoctorFixes(actions, { dryRun: false, confirm: async () => true })
};
async function ensureNetworkCapacity(deps = dockerDeps) {
  const first = deps.probe();
  if (first === null || !POOL_EXHAUSTED.test(first))
    return { ok: true, removed: [] };
  const planned = (await deps.planUnused()).filter((action) => action.id.startsWith("remove-network:") && action.status === "planned");
  const applied = await deps.apply(planned);
  const removed = applied.filter((action) => action.status === "applied").map((action) => action.id.slice("remove-network:".length));
  const second = deps.probe();
  if (second === null)
    return { ok: true, removed };
  return { ok: !POOL_EXHAUSTED.test(second), removed, error: second.split(/\r?\n/)[0] };
}
export {
  ensureNetworkCapacity
};
