#!/bin/sh
# Written by scripts/agent-plugin.mjs. Starts `flisk mcp` (the Flisk CLI's own stdio MCP server) from the user's
# PATH, in the folder the agent was started in. It reads no credential and uses no network.
if ! command -v flisk >/dev/null 2>&1; then
  echo "flisk mcp: the flisk command was not found. Install the Flisk CLI first: npm install -g @flisk-sh/flisk" >&2
  exit 1
fi
exec flisk mcp
