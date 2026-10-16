# Connect Codex or Claude Code to the TDK MCP server

TDK includes a local Model Context Protocol (MCP) server in its CLI. Once TDK is installed, clients can launch `tdk mcp` over stdio; there is no separate MCP package or hosted endpoint. Start the client from the TDK project directory, or set that directory explicitly in the client configuration, so project tools find `.tdk/project.json`.

This guide covers Codex and Claude Code. You can ask for operations in plain language; you do not need to write JavaScript or call the tools by name.

![Animated Doctor, Up, Status, and Logs icon demo](../assets/tdk-mcp-tool-icons.svg)

## Install TDK

Install the CLI with npm (Node.js 22.12 or newer) or use the prebuilt binary:

```bash
npm install -g @tdk-landscape/tdk-cli-core
# or, on macOS/Linux
curl -fsSL https://tdk-landscape.github.io/install.sh | sh
tdk --version
```

Both installation paths include `tdk mcp`. You do not need to install an MCP SDK, package, or server separately. The CLI starts the MCP server locally and communicates with the client over stdio; it is not a network service. Docker and Tilt are needed to start a stack, but not to connect the client or run `doctor`.

## Connect Codex

Add a project-scoped entry to `.codex/config.toml` in the TDK project. Replace the example directory with the absolute path to the directory containing `.tdk/project.json`:

```toml
[mcp_servers.tdk]
command = "tdk"
args = ["mcp"]
cwd = "/path/to/your/tdk-project"
```

Codex loads project-scoped MCP settings only for trusted projects. You can also create the entry from a terminal with `codex mcp add tdk -- tdk mcp`, then set its `cwd` as shown above so it launches from the TDK project. Consult Codex's [MCP setup](https://developers.openai.com/codex/extend/mcp) for other configuration options.

Confirm the server appears in the desktop app with `/mcp`, or in the CLI with `codex mcp list`.

## Connect Claude Code

From the TDK project directory, add a local stdio server and start Claude Code there:

```bash
cd /path/to/your/tdk-project
claude mcp add --scope local --transport stdio tdk -- tdk mcp
claude
```

Run `/mcp` inside Claude Code to confirm the server is connected. The `local` scope keeps this configuration in your local Claude Code settings for the current project. See the [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) for other scopes and configuration options.

## Before you start

- Install TDK as described above. To start a stack, install and start Docker and install Tilt; see the [operator runbook](../operator-runbook.md).
- Open the TDK project you want to work with in Codex or Claude Code. Project actions need the working directory to contain `.tdk/project.json`.

The `doctor` check can run outside a TDK project. Listing resources, checking project status, and starting a stack need the client to launch TDK from a project root containing `.tdk/project.json`.

## A first run

### 1. Run doctor

Ask the connected agent:

> Run TDK doctor. Tell me what would block a stack from starting, and do not start anything yet.

Doctor checks Docker, Tilt, Docker Compose, host ports, and other local requirements. If a check fails, fix the reported issue and run doctor again. A passing doctor check means the host can start TDK; it does not mean the application services are ready.

### 2. Start the stack and check readiness

When doctor passes, ask:

> Start this project's TDK stack, then check status until Tilt reports readiness.

`up` starts Tilt detached and returns when startup has begun; a successful `up` response does not mean the stack is ready. Call `status` again until `data.tilt.readiness.ready` is `true`. If `status` reports pending services or failures, use `logs` to inspect them.

### 3. Inspect and stop

Ask the agent to list project resources or take a bounded log snapshot, then stop the stack when finished:

> List this project's TDK services and show their stack, type, and port.

> Show the last 10 minutes of API logs.

> Stop this project's TDK stack.

To start a subset, name the services; TDK also starts their dependencies and shared infrastructure: “Start only the `web` service and its dependencies, then check status.”

## What to ask your agent

| Goal | Example request |
| --- | --- |
| Check machine prerequisites | “Run TDK doctor and explain anything that needs fixing.” |
| Find services | “List this project's TDK resources.” |
| Check readiness | “Show the TDK status and tell me which services are ready.” |
| Start everything | “Start this project's TDK stack, then check status.” |
| Start selected services | “Start `web` and its dependencies.” |
| Inspect logs | “Show the latest 200 lines from `api`.” |
| Stop services | “Stop this project's TDK stack.” |

## If something goes wrong

- **Docker is not running:** start Docker Desktop, OrbStack, or Colima, then run doctor again.
- **Tilt CLI or Docker Compose is missing:** install the missing prerequisite using the links in the doctor output, then retry.
- **`Could not find project root`:** open the TDK project's root directory, the one containing `.tdk/project.json`.
- **Doctor passes but a service is not ready:** check project status and ask for that service's recent logs. Doctor checks the host and project configuration; it does not guarantee every running service is healthy.

## Tool reference

The server exposes these six tools, backed by the corresponding TDK CLI commands:

| Tool | What it does | Inputs |
| --- | --- | --- |
| `doctor` | Check whether this machine can run a TDK stack; use before `up`. | `noPing` (optional) |
| `up` | Start the whole stack or a subset in the background. It returns before readiness. | `stack`, `only`, `force`, `waitSeconds` (all optional) |
| `status` | Show stacks, resources, URLs, ports, and Tilt readiness. | None |
| `resource_list` | List project resources with their stack, type, and port. | `stack` (optional) |
| `logs` | Return a bounded snapshot of recent logs, not a live stream. | `services`, `tail` (default 200, maximum 10,000), `since` (for example `5m`) |
| `down` | Stop the running stack. | None |

For example, an MCP client that calls tools directly can run `doctor`, `up`, and `status` in sequence; keep checking `status` until `data.tilt.readiness.ready` is true. See the [TDK MCP quick guide](tdk-mcp.md) for call examples, the [machine-readable CLI reference](../reference/machine-readable-cli.md) for JSON output and exit codes, and the [doctor contract](../reference/doctor-contract.md) for doctor details.

## Reporting problems found while using the TDK MCP

TDK is open source. When an agent or a person using `tdk mcp` hits a framework problem, open an issue in [tdk-landscape/tdk-cli-core](https://github.com/tdk-landscape/tdk-cli-core/issues) with the tdk version, a minimal reproduction, and the expected behavior. If you have a fix, open a pull request against the same repository.

Example: [#1204](https://github.com/tdk-landscape/tdk-cli-core/issues/1204) reports that `tdk project` output under `.tdk/.tdk-out` is picked up by Vitest in Node and TypeScript projects.
