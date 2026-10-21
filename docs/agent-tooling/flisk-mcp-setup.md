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
| A Flisk project directory, the folder that holds `.tdk/project.json` | Every tool except `doctor`. |

`doctor` runs outside a project, so you can connect the server and check the machine before a project exists.

## 1. Install Flisk

Install the CLI with npm (Node.js 22.12 or newer):

```bash
npm install -g @flisk-sh/flisk
```

Or install the prebuilt binary, which needs no Node.js (macOS and Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | sh
```

Check that both the CLI and the MCP server are there:

```bash
flisk --version
flisk mcp --help
```

Both installation paths install the same CLI, and `flisk mcp` comes with it. There is no MCP package to add: no `@tdk-landscape/flisk-mcp`, no `npx @tdk-landscape/flisk-mcp`, and no MCP SDK to install. Docker and Tilt are needed to start a stack, but not to connect the client or to run `doctor`.

## 2. Point a client at `flisk mcp`

The client launches `flisk mcp` for you. The server inherits the directory it is started in, so the project tools find `.tdk/project.json` when the client runs inside a Flisk project. Two ways to make that deterministic:

- start the client in the project directory, or
- set the working directory in the client's configuration: `cwd` in Codex, and a `cd` in the command for clients that have no working-directory setting.

### Codex

Add a project-scoped entry to `.codex/config.toml` in the Flisk project. Replace the example directory with the absolute path to the folder that contains `.tdk/project.json`:

```toml
[mcp_servers.tdk]
command = "flisk"
args = ["mcp"]
cwd = "/path/to/your/tdk-project"
```

`cwd` is the directory Codex starts the server in. Codex loads project-scoped MCP settings only for trusted projects; `~/.codex/config.toml` is the global variant. You can also create the entry from a terminal with `codex mcp add flisk -- flisk mcp`, then add `cwd` to it. Confirm the server is connected with `/mcp` in the app or `codex mcp list` in the CLI. Codex's [MCP guide](https://developers.openai.com/codex/extend/mcp) lists the other options.

### Claude Code

From the Flisk project directory, add a local stdio server and start Claude Code there:

```bash
cd /path/to/your/tdk-project
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
      "args": ["-c", "cd \"/path/to/your/tdk-project\" && exec flisk mcp"]
    }
  }
}
```

Replace the example path with the absolute path to the folder that contains `.tdk/project.json`. A desktop app may not see the same `PATH` as your shell, so if the server does not start, put the absolute path to the `flisk` binary in that `cd` line. Restart Claude Desktop after editing the file. The [MCP quickstart](https://modelcontextprotocol.io/quickstart/user) shows where this file lives and how the client restarts it.

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

The server exposes nine tools. Six cover the stack lifecycle: `doctor`, `up`, `down`, `status`, `logs`, and `resource_list`. Three more cover agent resources: `restart_resource`, `list_agents`, and `get_agent_sessions`. Each one runs the matching Flisk CLI command with `--json`, so it behaves exactly like the command you would run by hand.

| Tool | What it does | Use it when | Inputs |
| --- | --- | --- | --- |
| `doctor` | Checks whether this machine can run a Flisk stack, and the project config when it runs in a project. | First, before `up`. | `projectPath`, `noPing` |
| `up` | Starts the stack, or a subset of it, detached, and returns before readiness. | After `doctor` passes. | `projectPath`, `stack`, `only`, `force`, `dryRun`, `waitSeconds` |
| `status` | Reports stacks, resources, ingress URLs, ports, and Tilt readiness. | To see whether the stack is ready. | `projectPath` |
| `logs` | Returns a bounded snapshot of recent logs, 200 lines by default and 10,000 at most. | To read what a service printed. | `projectPath`, `services`, `tail`, `since` |
| `resource_list` | Lists the project's services with their stack, type, and port. | To find a service name. | `projectPath`, `stack` |
| `down` | Stops the running stack. | When you are finished. | `projectPath`, `dryRun` |
| `restart_resource` | Restarts a running resource, or triggers its rebuild. | When one service needs a fresh start. | `projectPath`, `resource` |
| `list_agents` | Lists the project's agent resources with their stack, runtime, durability, and port. | To work with agent resources. | `projectPath`, `stack` |
| `get_agent_sessions` | Reads session checkpoints from a running agent resource. | To inspect an agent's session state. | `projectPath`, `resource`, `sessionId` |

`projectPath` is an absolute path to a Flisk project root. Every tool accepts it, so a client that does not launch the server from the project directory can still target the right project. Without it, the tools use the server's own working directory and fail with `Could not find project root` when that directory is not a Flisk project.

`get_agent_sessions` needs both a `resource` and a `sessionId`; the other tools need one argument at most.

To start part of a stack, name the services in `only`. Flisk starts their dependencies and the shared infrastructure with them.

## Where the server runs

- The server is a local process that your client starts and speaks to over stdio. Nothing listens on a port.
- There is no TDK-hosted MCP server and no remote URL to configure.
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
