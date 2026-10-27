# Flisk agent tooling

The Flisk CLI ships a local Model Context Protocol (MCP) server, `flisk mcp`. Your MCP client starts it as a child process and talks to it over stdio on your machine. It is not a hosted endpoint, and there is no separate MCP package or server to install.

![Animated Doctor, Up, Status, and Logs icon demo](../assets/flisk-mcp-tool-icons.svg)

- [Set up the Flisk MCP server](flisk-mcp-setup.md): install Flisk, point Codex, Claude Code, Claude Desktop, or Cursor at `flisk mcp`, and run `doctor` then `up` for the first time. Start here if no client can call Flisk yet.
- [Flisk MCP quick guide](flisk-mcp.md): what each tool does and how to call it once the server is connected.

You can ask for operations in plain language; you do not need to write JavaScript or call the tools by name.

## The tools at a glance

The server exposes twenty-one tools: `doctor`, `up`, `down`, `status`, `logs`, `resource_list`, `resource_restart`, `agent_list`, `agent_sessions`, `stack_list`, `project_info`, `network_list`, `config_verify`, `config_explain`, `runtime_check`, `config_regenerate`, `resource_create`, `stack_assign`, `project_init`, `project_eject`, and `project_import`. The [setup guide](flisk-mcp-setup.md#the-tools) says what each one does and when to use it.

## Reporting problems found while using the Flisk MCP

Flisk is open source. When an agent or a person using `flisk mcp` hits a framework problem, open an issue in [flisk-sh/flisk](https://github.com/flisk-sh/flisk/issues) with the flisk version, a minimal reproduction, and the expected behavior. If you have a fix, open a pull request against the same repository.

Example: [#1204](https://github.com/flisk-sh/flisk/issues/1204) reports that `flisk project` output under `.flisk/.flisk-out` is picked up by Vitest in Node and TypeScript projects.
