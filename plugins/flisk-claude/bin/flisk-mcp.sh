#!/bin/sh
# Written by scripts/agent-plugin.mjs. Starts `flisk mcp` (the Flisk CLI's own stdio MCP server) from the user's
# PATH, in the folder the agent was started in. Needs the CLI: npm install -g @flisk-sh/flisk
# It reads no credential and uses no network.
exec flisk mcp
