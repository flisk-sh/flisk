import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createRootProgram
} from "./chunk-HG2XF7CF.js";
import {
  FliskError
} from "./chunk-73W4Y4TI.js";
import "./chunk-VVP2Y2AJ.js";

// dist/commands/lazy-command.js
var LAZY_COMMANDS = {
  stacks: { module: "./stacks.js", exportName: "stacksCommand" },
  resources: { module: "./resources.js", exportName: "resourcesCommand" },
  projects: { module: "./projects.js", exportName: "projectsCommand" },
  up: { module: "./up.js", exportName: "upCommand" },
  down: { module: "./down.js", exportName: "downCommand" },
  mcp: { module: "./mcp.js", exportName: "mcpCommand" },
  connect: { module: "./connect.js", exportName: "connectCommand" },
  logs: { module: "./logs.js", exportName: "logsCommand" },
  eject: { module: "./eject.js", exportName: "ejectCommand" },
  export: { module: "./export.js", exportName: "exportCommand" },
  import: { module: "./import.js", exportName: "importCommand" },
  open: { module: "./open.js", exportName: "openCommand" },
  status: { module: "./status.js", exportName: "statusCommand" },
  stack: { module: "./stack.js", exportName: "stackCommand" },
  resource: { module: "./resource.js", exportName: "resourceCommand" },
  runtime: { module: "./runtime.js", exportName: "runtimeCommand" },
  project: { module: "./project.js", exportName: "projectCommand" },
  create: { module: "./create.js", exportName: "createCommand" },
  tool: { module: "./tool.js", exportName: "toolCommand" },
  config: { module: "./config.js", exportName: "configCommand" },
  ui: { module: "./ui.js", exportName: "uiCommand" },
  os: { module: "./os.js", exportName: "osCommand" },
  version: { module: "./version.js", exportName: "versionCommand" },
  maintainers: { module: "./maintainers.js", exportName: "maintainersCommand" },
  doctor: { module: "./doctor.js", exportName: "doctorCommand" },
  completion: { module: "./completion.js", exportName: "completionCommand" },
  upgrade: { module: "./upgrade.js", exportName: "upgradeCommand" },
  networks: { module: "./networks.js", exportName: "networksCommand" },
  agent: { module: "./agent.js", exportName: "agentCommand" },
  restart: { module: "./restart.js", exportName: "restartCommand" },
  run: { module: "./run.js", exportName: "runServiceCommand" },
  distribute: { module: "./distribute.js", exportName: "distributeCommand" },
  repos: { module: "./repos.js", exportName: "reposCommand" }
};
async function runLazyCommand(spec, argv) {
  const top = spec.path[0] ?? "";
  const entry = LAZY_COMMANDS[top];
  if (!entry) {
    throw new FliskError(`No lazy command module is registered for "flisk ${top}".`, [
      "Reinstall Flisk, then try the command again."
    ]);
  }
  const mod = await importLazyModule(top, entry.module);
  const command = mod[entry.exportName];
  if (!command || typeof command !== "object" || !("parseAsync" in command)) {
    throw new FliskError(`${entry.module} does not export a Commander Command as ${entry.exportName}.`, ["Reinstall Flisk, then try the command again."]);
  }
  if (top === "completion") {
    const { createProgram } = await import("./program-LV7EIZNE.js");
    await createProgram().parseAsync([...argv], { from: "user" });
    return;
  }
  const program = createRootProgram();
  program.addCommand(command);
  await program.parseAsync([...argv], { from: "user" });
}
async function importLazyModule(name, path) {
  switch (name) {
    case "stacks":
      return await import("./stacks-LNMQROT2.js");
    case "resources":
      return await import("./resources-YI7BOWQU.js");
    case "projects":
      return await import("./projects-V7VG7UTX.js");
    case "up":
      return await import("./up-4UG4MIX6.js");
    case "down":
      return await import("./down-DATXS55U.js");
    case "mcp":
      return await import("./mcp-ARUZKAKR.js");
    case "connect":
      return await import("./connect-VFPEGNLD.js");
    case "logs":
      return await import("./logs-VCN5WFGF.js");
    case "eject":
      return await import("./eject-HH5PXP3D.js");
    case "export":
      return await import("./export-DTX2CCSS.js");
    case "import":
      return await import("./import-DA4VA7BA.js");
    case "open":
      return await import("./open-K6R33N56.js");
    case "status":
      return await import("./status-HMIXPSBF.js");
    case "stack":
      return await import("./stack-A2RUAY3C.js");
    case "resource":
      return await import("./resource-2FLFYLUU.js");
    case "runtime":
      return await import("./runtime-SFWDGXHA.js");
    case "project":
      return await import("./project-YGGX77ZB.js");
    case "create":
      return await import("./create-SMA2YBEJ.js");
    case "tool":
      return await import("./tool-NS637CHA.js");
    case "config":
      return await import("./config-M3SOCQYT.js");
    case "ui":
      return await import("./ui-BR3GCOUR.js");
    case "os":
      return await import("./os-6QWLQLOG.js");
    case "version":
      return await import("./version-IAMROMS2.js");
    case "maintainers":
      return await import("./maintainers-NCMTJ36S.js");
    case "doctor":
      return await import("./doctor-P5ZOHZYD.js");
    case "completion":
      return await import("./completion-TEHLBVMH.js");
    case "upgrade":
      return await import("./upgrade-P43XPVB6.js");
    case "networks":
      return await import("./networks-MAZWKSW2.js");
    case "agent":
      return await import("./agent-45AW67QE.js");
    case "restart":
      return await import("./restart-763LTTOA.js");
    case "run":
      return await import("./run-VGQBHYYW.js");
    case "distribute":
      return await import("./distribute-MGCHQ563.js");
    case "repos":
      return await import("./repos-6SM654WR.js");
    default:
      throw new FliskError(`No lazy import for command "${name}" (${path}).`, [
        "Reinstall Flisk, then try the command again."
      ]);
  }
}
export {
  LAZY_COMMANDS,
  runLazyCommand
};
