import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/colima.js
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
var defaultDeps = () => ({
  env: process.env,
  dockerAnswers: () => {
    try {
      execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
        encoding: "utf-8",
        timeout: 1e4,
        stdio: ["ignore", "pipe", "ignore"]
      });
      return true;
    } catch {
      return false;
    }
  },
  run: (command, args) => {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      timeout: 2e4,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return `${result.stdout ?? ""}${result.stderr ?? ""}`;
  },
  exists: existsSync,
  home: process.env.HOME ?? ""
});
function isColimaDocker(deps = defaultDeps()) {
  const host = deps.env.DOCKER_HOST ?? "";
  if (host.includes(".colima"))
    return true;
  const socket = join(deps.home, ".colima", "default", "docker.sock");
  return deps.exists(socket) && host.includes("docker.sock") === false && host !== "";
}
function checkColima(deps = defaultDeps()) {
  if (!isColimaDocker(deps)) {
    return { isColima: false, running: true };
  }
  let status = "";
  try {
    status = deps.run("colima", ["status"]);
  } catch (error) {
    const message = String(error?.stderr ?? error);
    if (/rosetta|native arch/i.test(message)) {
      return {
        isColima: true,
        running: false,
        problem: "Lima is installed as an x86_64 build, so it cannot start the Colima VM on this Mac",
        fix: "Install a native Lima (brew reinstall lima, or use a native limactl on PATH) and run `colima start`"
      };
    }
    if (deps.dockerAnswers()) {
      return {
        isColima: true,
        running: true,
        problem: "The Colima VM is running, but the colima CLI on this PATH cannot see it",
        fix: "Use a native limactl (a Rosetta x86_64 limactl cannot talk to the VM): brew reinstall lima, or put a native limactl first on PATH"
      };
    }
    if (/not running/i.test(message)) {
      return {
        isColima: true,
        running: false,
        problem: "The Colima VM is not running",
        fix: "Run `colima start`"
      };
    }
    return {
      isColima: true,
      running: false,
      problem: "The state of the Colima VM could not be read",
      fix: "Run `colima status` to see what it says"
    };
  }
  if (/is running/i.test(status)) {
    const arch = /arch:\s*(\S+)/.exec(status)?.[1];
    return { isColima: true, running: true, arch };
  }
  if (deps.dockerAnswers()) {
    return {
      isColima: true,
      running: true,
      problem: "The Colima VM is running, but the colima CLI on this PATH cannot see it",
      fix: "Use a native limactl (a Rosetta x86_64 limactl cannot talk to the VM): brew reinstall lima, or put a native limactl first on PATH"
    };
  }
  return {
    isColima: true,
    running: false,
    problem: "The Colima VM is not running",
    fix: "Run `colima start`"
  };
}
function planColimaRepair(status, dockerAnswers) {
  if (!status.isColima)
    return void 0;
  if (status.problem && /x86_64|rosetta|native arch|cannot see it/i.test(status.problem)) {
    return "native-lima";
  }
  if (!status.running)
    return "start";
  if (!dockerAnswers)
    return "restart";
  return void 0;
}
function nativeLimaPath(env = process.env) {
  const home = env.HOME ?? "";
  const candidates = [
    "/opt/homebrew/bin",
    home ? `${home}/.local/bin` : "",
    home ? `${home}/bin` : ""
  ].filter(Boolean);
  for (const dir of candidates) {
    const candidate = join(dir, "limactl");
    try {
      if (!existsSync(candidate))
        continue;
      let archOutput = "";
      try {
        archOutput = execFileSync("file", ["-bL", candidate], {
          encoding: "utf-8",
          timeout: 5e3,
          stdio: ["ignore", "pipe", "ignore"]
        });
      } catch {
        return dir;
      }
      if (/arm64|aarch64/i.test(archOutput))
        return dir;
    } catch {
    }
  }
  return void 0;
}

export {
  isColimaDocker,
  checkColima,
  planColimaRepair,
  nativeLimaPath
};
