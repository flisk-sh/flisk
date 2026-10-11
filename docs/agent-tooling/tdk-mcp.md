# TDK MCP quick guide

When the TDK MCP is connected to Codex, ask for an operation in plain language, for example: **“Run TDK doctor and summarize anything blocking startup.”** The connector exposes tools for host checks, project services, stack lifecycle, and recent logs.

## Start with Doctor

Doctor checks whether the machine can run TDK. It reports prerequisites such as Docker, Tilt, Docker Compose, available host ports, and whether the current host can start a stack. It can run outside a TDK project.

```js
await tools.mcp__tdk__doctor({});
```

The response includes `data.ready`, `data.host.canUp`, and individual checks with messages and suggested fixes. A passing host check does not mean an application service is already healthy; inspect project status for that.

If the MCP server is not running from the project directory, set its absolute path so Doctor also checks that project's service configuration:

```js
await tools.mcp__tdk__doctor({ projectPath: "/path/to/tdk-project" });
```

## Inspect a TDK project

Project operations use the MCP server's current directory by default. To target a project from a projectless chat or another working directory, pass its absolute root in `projectPath`:

```js
await tools.mcp__tdk__resource_list({ projectPath: "/path/to/tdk-project" });
await tools.mcp__tdk__status({ projectPath: "/path/to/tdk-project" });
```

The directory must contain `.tdk/project.json` or be within a TDK project. The tools return an error such as `Could not find project root` if no TDK project is available.

## Start, inspect logs, and stop

Doctor should be run before startup. `up` starts the stack detached and returns without waiting for full readiness; use `status` to check Tilt readiness afterward.

```js
const projectPath = "/path/to/tdk-project";
await tools.mcp__tdk__doctor({ projectPath });
await tools.mcp__tdk__up({ projectPath });
await tools.mcp__tdk__status({ projectPath });
await tools.mcp__tdk__logs({ projectPath, tail: 200 });
```

To start selected services, include their names in `only`; TDK includes their dependencies and shared infrastructure. `up` also accepts a `stack`, a `waitSeconds` window for early failures, and `force` to replace an existing Tilt process. For log snapshots, `logs` accepts `services`, `since` (such as `5m`), and `tail` (maximum 10,000 lines). Stop the stack with:

```js
await tools.mcp__tdk__down({ projectPath: "/path/to/tdk-project" });
```

## Ask in outcomes

Useful requests describe the check or result you want:

- “Run TDK doctor and tell me what needs fixing before startup.”
- “List this project’s TDK services and show which are ready.”
- “Start only the web service and its dependencies, then check status.”
- “Show the latest five minutes of API logs.”

The MCP manages TDK stack operations. For generated project configuration, CLI exit codes, and JSON contracts, see the [machine-readable CLI reference](../reference/machine-readable-cli.md).
