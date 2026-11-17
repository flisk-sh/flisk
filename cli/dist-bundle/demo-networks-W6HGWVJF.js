import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  applyDoctorFixes,
  planDoctorFixes
} from "./chunk-DCOXNGQQ.js";
import "./chunk-RD63MOSC.js";
import "./chunk-KHTVPPO5.js";
import "./chunk-3P4YMCKC.js";
import "./chunk-X45DIH6R.js";
import "./chunk-QRGFABNE.js";
import "./chunk-QQ2PAYEU.js";
import "./chunk-SYTFMWWH.js";
import "./chunk-ZI7AIJRM.js";
import "./chunk-KT6PYS2C.js";
import "./chunk-TZFR2MQ6.js";
import "./chunk-LJHNJFBB.js";
import "./chunk-BH5IJ6AV.js";
import "./chunk-HS5H5D2L.js";
import "./chunk-2ZNKJUYM.js";
import "./chunk-2BH5UW2N.js";
import "./chunk-U3566SRZ.js";
import "./chunk-UPCGXTMS.js";
import "./chunk-ARPSTQFE.js";
import "./chunk-73W4Y4TI.js";
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
