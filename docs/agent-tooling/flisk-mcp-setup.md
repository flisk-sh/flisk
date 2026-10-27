# Set up the Flisk MCP server

`flisk mcp` is a Model Context Protocol (MCP) server that ships inside the Flisk CLI. Your MCP client starts it as a child process and talks to it over stdio.

It runs on your machine, next to your project. It is not a hosted endpoint: there is no URL to point a client at, no account to create, and no separate MCP package to install.

This page is the setup path, from installing Flisk to a first `doctor` and `up`. For tool calls and everyday use, see the [Flisk MCP quick guide](flisk-mcp.md).

## What you need

| Requirement | What it is for |
| --- | --- |
| The Flisk CLI (`flisk --version`) | Everything. `flisk mcp` is a subcommand of it. |
| An MCP client: Codex, Claude Code, Claude Desktop, or Cursor | Connecting the server. |
| Docker running and Tilt installed | Starting and stopping a stack. |
| A Flisk project directory, the folder that holds `.flisk/project.json` | Every tool except `doctor`. |

`doctor` runs outside a project, so you can connect the server and check the machine before a project exists.

## 1. Install Flisk

Install the CLI with npm (Node.js 22.12 or newer):

```bash
npm install -g @flisk-sh/flisk
```

Or install the prebuilt binary, which needs no Node.js (macOS and Linux):

```bash
curl -fsSL https://flisk.sh/install.sh | sh
```

Check that both the CLI and the MCP server are there:

```bash
flisk --version
flisk mcp --help
```

Both installation paths install the same CLI, and `flisk mcp` comes with it. There is no MCP package to add: no `@flisk-sh/flisk-mcp`, no `npx @flisk-sh/flisk-mcp`, and no MCP SDK to install. Docker and Tilt are needed to start a stack, but not to connect the client or to run `doctor`.

## 2. Point a client at `flisk mcp`

Shortcut for Claude Code, Cursor and Codex: `flisk connect <claude|cursor|codex>` in the project writes the project entry shown below (merged into an existing file) and the Flisk skills. Add `--dry-run` to see the files first. See [Flisk for AI agents](../agents/flisk-for-agents.md). The manual steps follow.

The client launches `flisk mcp` for you. The server inherits the directory it is started in, so the project tools find `.flisk/project.json` when the client runs inside a Flisk project. Two ways to make that deterministic:

- start the client in the project directory, or
- set the working directory in the client's configuration: `cwd` in Codex, and a `cd` in the command for clients that have no working-directory setting.

### Codex

Add a project-scoped entry to `.codex/config.toml` in the Flisk project. Replace the example directory with the absolute path to the folder that contains `.flisk/project.json`:

```toml
[mcp_servers.flisk]
command = "flisk"
args = ["mcp"]
cwd = "/path/to/your/flisk-project"
```

`cwd` is the directory Codex starts the server in. Codex loads project-scoped MCP settings only for trusted projects; `~/.codex/config.toml` is the global variant. You can also create the entry from a terminal with `codex mcp add flisk -- flisk mcp`, then add `cwd` to it. Confirm the server is connected with `/mcp` in the app or `codex mcp list` in the CLI. Codex's [MCP guide](https://developers.openai.com/codex/extend/mcp) lists the other options.

### Claude Code

From the Flisk project directory, add a local stdio server and start Claude Code there:

```bash
cd /path/to/your/flisk-project
claude mcp add --scope local --transport stdio flisk -- flisk mcp
claude
```

`--scope local` keeps the configuration in your local Claude Code settings for the current project. The server starts in the directory Claude Code runs in, so start Claude Code in the project. Run `/mcp` inside Claude Code to confirm the server is connected. The [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) covers the other scopes.

### Claude Desktop

Claude Desktop has no working-directory setting, so run the server through a shell that changes directory first. In `claude_desktop_config.json` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "flisk": {
      "command": "sh",
      "args": ["-c", "cd \"/path/to/your/flisk-project\" && exec flisk mcp"]
    }
  }
}
```

Replace the example path with the absolute path to the folder that contains `.flisk/project.json`. A desktop app may not see the same `PATH` as your shell, so if the server does not start, put the absolute path to the `flisk` binary in that `cd` line. Restart Claude Desktop after editing the file. The [MCP quickstart](https://modelcontextprotocol.io/quickstart/user) shows where this file lives and how the client restarts it.

### Cursor

Put the entry in `.cursor/mcp.json` in the project, or in `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "flisk": {
      "type": "stdio",
      "command": "sh",
      "args": ["-c", "cd \"${workspaceFolder}\" && exec flisk mcp"]
    }
  }
}
```

`${workspaceFolder}` is the folder that holds `.cursor/mcp.json`. Cursor's documented stdio fields are `type`, `command`, `args`, `env`, and `envFile`; there is no `cwd` key, so the `cd` in the command is what pins the project directory. The [Cursor MCP guide](https://cursor.com/docs/mcp) lists the rest of the format.

## 3. First run

![Animated Doctor, Up, Status, and Logs icon demo](../assets/flisk-mcp-tool-icons.svg)

### 1. Run doctor

Ask the connected agent:

> Run Flisk doctor. Tell me what would block a stack from starting, and do not start anything yet.

Doctor checks the container runtime, Tilt, Docker Compose, host and ingress ports, disk space, and the project's own configuration when the server runs inside a project. The response carries `data.ready` and `data.host.canUp`, plus one entry per check with a message and a suggested fix.

Fix what doctor reports and run it again. A passing doctor check means the host can start a Flisk stack. It does not mean your services are healthy.

### 2. Start the stack

When doctor passes, ask:

> Start this project's Flisk stack.

`up` starts Tilt detached and returns as soon as startup has begun. A successful `up` is not a readiness signal: it says the stack was started, not that it is up. A first build can take minutes.

### 3. Check readiness

> Check the Flisk status and tell me which services are ready.

Call `status` again until `data.tilt.readiness.ready` is `true`. `status` reports the stacks, the resources, their ingress URLs and ports, and Tilt readiness: `ready`, `pending`, `failures`, or `enabled`, and `null` when no Tilt answers.

### 4. Look at the logs, then stop

`logs` returns a bounded snapshot of recent output, not a live stream:

> Show the last 10 minutes of API logs.

Stop the stack when you are done:

> Stop this project's Flisk stack.

### 5. Ask in outcomes

| Goal | Example request |
| --- | --- |
| Check machine prerequisites | “Run Flisk doctor and explain anything that needs fixing.” |
| Find services | “List this project's Flisk resources.” |
| Check readiness | “Show the Flisk status and tell me which services are ready.” |
| Start everything | “Start this project's Flisk stack, then check status.” |
| Start selected services | “Start `web` and its dependencies.” |
| Inspect logs | “Show the latest 200 lines from `api`.” |
| Stop services | “Stop this project's Flisk stack.” |

## The tools

The server exposes twenty-one tools. Six cover the stack lifecycle: `doctor`, `up`, `down`, `status`, `logs`, and `resource_list`. Three cover agent resources: `resource_restart`, `agent_list`, and `agent_sessions`. Six inspect the project and its generated files: `stack_list`, `project_info`, `network_list`, `config_verify`, `config_explain`, and `runtime_check`. Six create or change files: `config_regenerate`, `resource_create`, `stack_assign`, `project_init`, `project_eject`, and `project_import`. Each one runs the matching Flisk CLI command, so it behaves exactly like the command you would run by hand. The first fifteen, `project_eject` and `project_import` run it with `--json` and return its envelope; the other four that create or change files return the command's text output as `exitCode`, `output`, and `stderr`, and are an error result when it exits non-zero.

The tools were renamed to the `<noun>_<verb>` pattern the others follow: `restart_resource` is now `resource_restart`, `list_agents` is `agent_list`, and `get_agent_sessions` is `agent_sessions`. A call to a former name still works, so an existing agent configuration keeps running, but `tools/list` shows only the new names.

| Tool | What it does | Use it when | Inputs |
| --- | --- | --- | --- |
| `doctor` | Checks whether this machine can run a Flisk stack, and the project config when it runs in a project. | First, before `up`. | `projectPath`, `noPing` |
| `up` | Starts the stack, or a subset of it, detached, and returns before readiness. | After `doctor` passes. | `projectPath`, `stack`, `only`, `force`, `dryRun`, `waitSeconds` |
| `status` | Reports stacks, resources, ingress URLs, ports, and Tilt readiness. | To see whether the stack is ready. | `projectPath` |
| `logs` | Returns a bounded snapshot of recent logs, 200 lines by default and 10,000 at most. | To read what a service printed. | `projectPath`, `services`, `tail`, `since` |
| `resource_list` | Lists the project's services with their stack, type, and port. | To find a service name. | `projectPath`, `stack` |
| `down` | Stops the running stack. | When you are finished. | `projectPath`, `dryRun` |
| `resource_restart` | Restarts a running resource, or triggers its rebuild. | When one service needs a fresh start. | `projectPath`, `resource` |
| `agent_list` | Lists the project's agent resources with their stack, runtime, durability, and port. | To work with agent resources. | `projectPath`, `stack` |
| `agent_sessions` | Lists the sessions of a running agent resource, or reads one checkpoint. | To inspect an agent's session state. | `projectPath`, `resource`, `sessionId` (optional) |
| `stack_list` | Lists the project's stacks with their resource counts. | To find a stack name. | `projectPath`, `services`, `verbose` |
| `project_info` | Reports the project root, whether the generated master files exist, and resource and stack counts. | To check that a directory is a configured Flisk project. | `projectPath` |
| `network_list` | Lists the Traefik URL of every frontend and API service and whether it answers. | To find the URL to open or call. | `projectPath`, `stack` |
| `config_verify` | Checks that the generated files match `.flisk/project.json` and that every `service.json` is valid. | After editing `service.json` or `project.json`, or when `up` reports drift. | `projectPath` |
| `config_explain` | Says whether a file is generated or user-owned, and what editing it does on `up`. | Before editing a file you did not write. | `projectPath`, `file` |
| `runtime_check` | Checks that the installed CLI has its bundled runtime assets. | When generated files or templates are missing. | `projectPath` |
| `config_regenerate` | Regenerates the master config files from `.flisk/project.json`; a dry run unless `dryRun` is `false`. | When `config_verify` reports a drifted generated file. | `projectPath`, `dryRun` |
| `resource_create` | Scaffolds a service (or registers a directory that already has a `service.json`) without prompts. | To add a backend, frontend, worker, MCP server, or agent. | `projectPath`, `name`, `type`, `stack`, `framework`, `language`, `port`, `features`, `runtime`, `durability` |
| `stack_assign` | Assigns resources that have no stack yet to a stack. | To group services so `up` can start them together. | `projectPath`, `stack`, `resources` |
| `project_init` | Creates a Flisk project in a directory, or clones a starter template into it. | To start a new project. | `projectPath`, `template`, `path`, `agentSkills` |
| `project_eject` | Writes `EJECTED.md`, which lists the generated Tilt files and how to run the stack with plain Tilt. It copies, moves, and deletes nothing. | When the user has decided to stop using the Flisk CLI. | `projectPath`, `confirm`, `dryRun` |
| `project_import` | Imports the services in a directory's root `docker-compose.yml` as bring-your-own `service.json` files. | To adopt an existing Compose project. | `projectPath`, `dir`, `dryRun`, `force` |

`projectPath` is an absolute path to a Flisk project root. Every tool accepts it, so a client that does not launch the server from the project directory can still target the right project. Without it, the tools use the server's own working directory and fail with `Could not find project root` when that directory is not a Flisk project. For `project_init` it is the existing directory to create the project in, or to clone the template from.

`agent_sessions`, `resource_restart` and `resource_create` need a `resource` or `name`, `config_explain` a `file`, and `stack_assign` a `stack` and at least one name in `resources`; without a `sessionId`, `agent_sessions` lists the agent's sessions.

The tools that change files are careful by default. `config_regenerate` only reports what would change until it is called with `dryRun: false`; a real run discards hand edits in the generated files. `resource_create` refuses a directory that already exists unless it has a `service.json`, which it then registers; calling it again for a resource that is already registered rewrites that `service.json` and can give it a new port, so check `resource_list` first. `stack_assign` refuses a resource that is already in a stack. `project_init` never passes `--force`, so it never overwrites an existing `.flisk/project.json`; inside an existing project it refreshes that project's generated files. Leaving Flisk is your decision, so `project_eject` is refused unless it is called with `confirm: true`; with `dryRun: true` it only lists what it would write. `project_import` downloads and runs the pinned `flisk-import` package from npm, even for a dry run, and writes the `service.json` files without asking unless `dryRun` is `true`; it overwrites an existing one only with `force: true`.

Some commands have no tool, so an agent runs them in a shell where you can see them:

- `flisk config migrate`, `flisk config enable-infra`, and `flisk config disable-infra`: they rewrite `service.json` files or `.flisk/project.json` and have no dry run. Each prints one JSON envelope with `--json`.
- `flisk config edit`: it opens your editor.

To start part of a stack, name the services in `only`. Flisk starts their dependencies and the shared infrastructure with them.

## Where the server runs

- The server is a local process that your client starts and speaks to over stdio. Nothing listens on a port.
- There is no Flisk-hosted MCP server and no remote URL to configure.
- It runs with the permissions of the user who started the client, and every tool runs the same Flisk CLI command you would run by hand.
- It needs the Flisk CLI on the `PATH` of the process that launches it.

## If something goes wrong

- **The client does not list the server:** check that the command is `flisk` with the argument `mcp`, that `flisk --version` works in the same shell, and that the client was restarted after the configuration changed.
- **`Could not find project root`:** the server's working directory is not a Flisk project. Start the client in the project, set `cwd`, or pass `projectPath` with the absolute project path.
- **Docker is not running:** start Docker Desktop, OrbStack, or Colima, then run doctor again.
- **Tilt CLI or Docker Compose is missing:** install the missing prerequisite using the links in the doctor output, then retry.
- **Doctor passes but a service is not ready:** check project status and read that service's recent logs. Doctor checks the host and the project configuration, not every running service.
- **`up` returns but nothing comes up:** `up` is detached, so read the stack's status and logs instead of restarting it.

## Next

- [Flisk MCP quick guide](flisk-mcp.md): tool calls in a connected client, and the `projectPath` rules.
- [Machine-readable CLI reference](../reference/machine-readable-cli.md): the JSON shapes and exit codes behind each tool.
- [Doctor contract](../reference/doctor-contract.md): what doctor checks and how it reports.
- [Operator runbook](../operator-runbook.md): Docker, Tilt, and port prerequisites for running a stack.
