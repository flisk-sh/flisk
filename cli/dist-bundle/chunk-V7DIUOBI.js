import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/npx-invocation.js
import { existsSync } from "node:fs";
import { win32 } from "node:path";
function npxInvocation(npxArgs, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  if (platform !== "win32") {
    return { command: "npx", args: npxArgs, shell: false, windowsVerbatimArguments: false };
  }
  const execPath = runtime.execPath ?? process.execPath;
  const exists = runtime.exists ?? existsSync;
  if (/^node(\.exe)?$/i.test(win32.basename(execPath))) {
    const npxCli = win32.join(win32.dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js");
    if (exists(npxCli)) {
      return {
        // The runtime that owns npx-cli.js, by absolute path: a bare "node" would be searched in the current directory
        // first on Windows and could be another installation than the one whose npm holds npx-cli.js.
        command: execPath,
        args: [npxCli, ...npxArgs],
        shell: false,
        windowsVerbatimArguments: false
      };
    }
  }
  const comSpec = runtime.comSpec ?? "cmd.exe";
  const line = ["npx.cmd", ...npxArgs.map(quoteCmdArgument)].join(" ");
  return {
    command: comSpec,
    args: ["/d", "/s", "/c", `"${line}"`],
    shell: false,
    windowsVerbatimArguments: true
  };
}
var CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;
function quoteCmdArgument(arg) {
  let quoted = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  quoted = `"${quoted}"`;
  quoted = quoted.replace(CMD_META_CHARS, "^$1");
  return quoted.replace(CMD_META_CHARS, "^$1");
}
var SAFE_PACKAGE_SPEC = /^[A-Za-z0-9@._/:~+=^\\-]+$/;
function safePackageSpec(override, fallback) {
  if (typeof override !== "string" || override.startsWith("-"))
    return fallback;
  if (!SAFE_PACKAGE_SPEC.test(override))
    return fallback;
  return override;
}

export {
  npxInvocation,
  safePackageSpec
};
