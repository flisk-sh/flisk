# The Flisk plugin

One package that gives a coding agent Flisk: the [Flisk skills](skills) (the same ones `flisk project` writes into a new project) and the `flisk mcp` server. The agent can then build, start, check and fix your app on your own computer.

Install the Flisk CLI first. The plugin starts `flisk mcp` from your `PATH` and the skills run `flisk` commands:

```bash
npm install -g @flisk-sh/flisk
```

## Install it in your agent

| Agent | Install |
| --- | --- |
| Claude Code | `/plugin marketplace add flisk-sh/flisk`, then `/plugin install flisk@flisk` |
| Codex (CLI and app) | `codex plugin marketplace add flisk-sh/flisk`, then install Flisk from `/plugins` |
| GitHub Copilot CLI | `copilot plugin marketplace add flisk-sh/flisk`, then `copilot plugin install flisk@flisk` |
| Gemini CLI | `gemini extensions install https://github.com/flisk-sh/flisk` |
| Cursor | Install Flisk from the Cursor marketplace once it is listed. Until then, run `flisk connect cursor` in your project |

Just the MCP server, in one click: [Add to Cursor](https://cursor.com/en/install-mcp?name=flisk&config=eyJjb21tYW5kIjoiZmxpc2siLCJhcmdzIjpbIm1jcCJdfQ==) · [Install in VS Code](https://vscode.dev/redirect/mcp/install?name=flisk&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22flisk%22%2C%22args%22%3A%5B%22mcp%22%5D%7D). Each link opens the editor's own prompt to add `flisk mcp`.

Flisk is also listed in the official [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.flisk-sh/flisk) as `io.github.flisk-sh/flisk`, so clients that search the registry find it. Any other MCP client (Claude Desktop, Windsurf, Zed and the rest): add the stdio server `flisk mcp` by hand, as the [setup guide](../../docs/agent-tooling/flisk-mcp-setup.md) shows.

The MCP server runs in the folder your agent was started in. Start the agent in your project folder, or let it pass `projectPath` (the absolute path of the folder that holds `.flisk/project.json`) to the Flisk tools.

## What is in this folder

One set of files for every agent format, all written by [`scripts/agent-plugin.mjs`](../../scripts/agent-plugin.mjs) from [`cli/templates/agent-skills`](../../cli/templates/agent-skills). Change those and run `node scripts/agent-plugin.mjs`; do not edit the copies here.

| File | Read by |
| --- | --- |
| `plugin.json`, `mcp.json` | The open [Agent Plugins](https://agent-plugins.org) format: Codex and ChatGPT, Cursor, GitHub Copilot CLI |
| `.mcp.json` | Older Codex and Copilot builds that predate the open format |
| `../flisk-claude/` | Claude Code: the same skills, and an `.mcp.json` that runs `bin/flisk-mcp.sh`, a small launcher that starts `flisk mcp` (the Claude plugin directory only reads commands it knows) |
| `.claude-plugin/plugin.json` | Claude Code |
| `.codex-plugin/plugin.json` | Codex builds that predate the open format |
| `.cursor-plugin/plugin.json` | Cursor marketplace |
| `skills/` | Every agent above |
| `gemini/GEMINI.md` (repository root) | Gemini CLI (hand-written; the extension manifest is `gemini-extension.json` at the repository root) |

The marketplaces that list this plugin are `.claude-plugin/marketplace.json` (Claude Code, Copilot CLI), `.agents/plugins/marketplace.json` (Codex) and `.cursor-plugin/marketplace.json` (Cursor) at the repository root.

For the ChatGPT and Codex plugin directory, `node scripts/agent-plugin.mjs --openai-zip flisk.zip` writes the skills-only, desktop-only package to upload at [platform.openai.com/plugins](https://platform.openai.com/plugins). The directory takes local MCP servers only from partners OpenAI has approved, so this package has the skills without `flisk mcp`.
