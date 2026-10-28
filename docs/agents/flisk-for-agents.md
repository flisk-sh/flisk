# Flisk for AI agents

[← Back to the README](../../README.md#pick-your-agent)

One command gives your coding agent the Flisk runtime: the `flisk mcp` server and the Flisk skills. With them, Claude Code, Cursor or Codex can scaffold services, start the whole local stack, check it, read its logs and fix what fails, through Flisk, instead of writing Dockerfiles and Compose files by hand.

## The one command

Run it in your project folder (any folder works; a Flisk project is not required yet):

| Agent | Command | MCP entry it writes | Skills it writes |
| --- | --- | --- | --- |
| Claude Code | `flisk connect claude` | `.mcp.json` | `.claude/skills/` |
| Cursor | `flisk connect cursor` | `.cursor/mcp.json` | `.agents/skills/` |
| Codex | `flisk connect codex` | `.codex/config.toml` (with `cwd` set to the project) | `.agents/skills/` |

- `--dry-run` prints what it would write and writes nothing.
- It merges: other MCP servers and other settings in those files stay as they are. Running it again changes nothing.
- An existing, different `flisk` entry or a Flisk skill you edited is reported as `kept` and left alone. `--force` replaces it with the current one.
- `--global` writes the MCP entry to your user config instead (`~/.cursor/mcp.json`, `~/.codex/config.toml`), without skills. For Claude Code, use `claude mcp add --scope user flisk -- flisk mcp`; `flisk connect claude --global` stops with that suggestion.
- `--json` prints one `{schemaVersion, data, errors}` envelope with every file and its action (`create`, `update`, `unchanged`, `kept`).
- An unknown host stops with exit code 2 and the list of supported hosts. Any other MCP client can still run `flisk mcp` as a stdio server; the [MCP setup guide](../agent-tooling/flisk-mcp-setup.md) has the format.

The entries are the ones the [MCP setup guide](../agent-tooling/flisk-mcp-setup.md) describes for each client. The skills are the same files `flisk project` writes into a new project.

## What the agent can then do

The `flisk mcp` server gives the agent 21 tools. Each runs the matching Flisk command, so it behaves like the CLI:

- **Check the machine:** `doctor` reports what would stop a stack from starting, with a fix for each problem.
- **Build:** `project_init` creates a project or clones a starter, `resource_create` scaffolds a backend, frontend, worker, MCP server or agent, `stack_assign` puts resources in a stack, `config_regenerate` rewrites the generated master files (a dry run unless `dryRun` is `false`).
- **Run:** `up` starts the stack (or `only` some services and their dependencies), `status` reports readiness and URLs, `down` stops it, `resource_restart` restarts one service.
- **Inspect:** `project_info`, `resource_list`, `stack_list` and `network_list` report the project, its services, its stacks and their URLs; `runtime_check` checks that the installed CLI has its bundled engine.
- **Debug:** `logs` returns recent output, `config_verify` and `config_explain` check the generated files, `agent_list` and `agent_sessions` list agent resources and read their sessions. `project_import` adopts an existing Compose project and `project_eject` hands the generated Tilt files over (it needs `confirm: true`).

The skills tell the agent when to use which: `flisk-build` turns "build me a shop" into Flisk steps, `flisk-up`, `flisk-status`, `flisk-doctor` and `flisk-troubleshoot` cover the run-check-fix loop, and the recipes (`flisk-recipe-shop`, `flisk-recipe-saas`, `flisk-recipe-ai-agent`, `flisk-recipe-blog`) start from a working shape.

## A 60-second walkthrough

```bash
npm install -g @flisk-sh/flisk
mkdir my-shop && cd my-shop
flisk connect claude --dry-run   # see the files first
flisk connect claude
claude
```

In Claude Code, approve the project server `flisk` when it asks, and run `/mcp` to see it connected. Then ask:

```text
Build me a small online shop with a storefront and an orders API.
Run Flisk doctor first, then start the stack and give me the URLs.
```

With the skills, the agent's plan is: `doctor`, scaffold the services, `up`, then poll `status` until the stack is ready. A first build pulls images and can take minutes. When a service fails, it has `logs` and `config_verify` to find out why, instead of guessing at Docker. What it builds, and whether every fix lands, still depends on the agent and the model.

For Cursor, run `flisk connect cursor` and open the folder in Cursor. For Codex, run `flisk connect codex` and start `codex` in the folder; Codex loads a project `.codex/config.toml` only for trusted projects.

## Prompts to try

No project yet? Run `flisk connect claude` (or `cursor`, `codex`) in an empty folder and paste these in order. Each line names the tools the agent is expected to call.

| You want to | Ask the agent | Tools |
| --- | --- | --- |
| Check the machine is ready | "Run Flisk doctor and tell me what's missing." | `doctor` |
| Get a working stack from nothing | "Clone the Flisk agent-stack starter here, set it up, start it, and show me the URLs once everything is healthy." | `project_init` (`template: "agent-stack"`), then `project_init` again with `projectPath` set to the clone, then `up` and `status` with that `projectPath` |
| Add services | "Add a backend called `api` and a worker called `jobs`, then start the stack again." | `stack_list`, `resource_create` (`type: "backend"`, then `type: "worker"`, with `stack` when the project has more than one), `up` |
| Find and fix a failure | "Something in my stack is red. Find which service, read its logs, and fix it." | `status`, `logs`, `config_verify`, `resource_restart` |
| See what is running | "List this project's services, stacks and URLs." | `resource_list`, `stack_list`, `network_list` |
| Stop | "Stop the stack." | `down` |

The template clones into a new folder (`flisk-agent-stack` by default) and the server keeps running in the folder you started it in, so every tool after the clone needs that folder as `projectPath`. To skip that, start your agent inside the clone after the first step.

In a Flisk project (a folder with `.flisk/project.json`) that already has several services, the day-to-day use is the same loop without the setup: "start it", "why is `api` failing", "add a Redis". The agent reads the running stack through the tools instead of guessing at Docker. A repository that is not a Flisk project yet needs `project_init` first, or `project_import` when it has a root `docker-compose.yml`. For one-tool requests, see [Ask in outcomes](../agent-tooling/flisk-mcp-setup.md#5-ask-in-outcomes).

## What it is not

- Not a hosted service: `flisk mcp` is a local process your agent starts over stdio. Nothing listens on a port and there is no account.
- Not a deployment tool: it runs your stack on your machine with Docker and Tilt, and does not write Kubernetes manifests.
- Not a replacement for Docker or Tilt: you still need them installed to start a stack (`doctor` says what is missing).
- It does not touch secrets: `flisk connect` writes only the MCP config file and the skill files listed above, and never reads or writes `.env` files.
- It does not install your agent: install Claude Code, Cursor or Codex first ([Claude Code](claude-code.md), [Cursor](cursor.md), [Codex](codex.md)).
