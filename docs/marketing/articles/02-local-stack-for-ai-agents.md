---
title: Give your AI coding agent a local stack it cannot break
published: false
tags: ai, docker, devtools, typescript
canonical_url: https://flisk.sh/docs/quickstart/
---

<!-- Draft for #1447. Question source: flisk-sh/tdk-cli-core#792 ("catch hand-edited generated files with `tdk config verify` in CI, ask how"). Every command below was run against tdk 1.3.178. -->

"My agent edits the generated files in my local stack. How do I catch that in CI?"

That is the question behind [issue #792](https://github.com/flisk-sh/tdk-cli-core/issues/792). It matters more once an AI agent is editing your repo: an agent that hand-edits a generated Tiltfile will happily "fix" it, and the next `tdk up` runs the broken version.

The answer is a drift check. TDK writes the generated files, `tdk config verify` checks that they still match `.tdk/project.json`, and `tdk config regenerate` puts them back.

## Add an agent and an MCP server

For the agent side, TDK scaffolds the services for you. In the one-backend example I ran:

```bash
tdk resource bot --type agent --stack one-backend --yes
tdk resource tools --type mcp --stack one-backend --yes
```

The first creates a `bot` agent service. The second creates a `tools` MCP server for your agent to call. Both are `service.json` services like any other, so the generated files change when you add them, and the drift check has to stay green after that. (Separately, `tdk mcp` runs TDK's own MCP server over stdio for coding agents.)

## The drift check

With a clean project, the check passes:

```bash
tdk config verify
```

```
✅ All files are in sync!
```

Now simulate an agent (or a teammate) editing a generated file by hand:

```bash
echo "# hand edit" >> .tdk/.tdk-out/TILT_RESOURCE_DEFAULTS.star
tdk config verify
```

The check fails and exits with status 1. It prints a diff and tells you the fix:

```
Run `tdk config regenerate` to fix generated files.
```

```bash
tdk config regenerate
tdk config verify
```

After regeneration the check passes again, with exit status 0.

## Wire it into CI

The check is a single command with a meaningful exit code, so a CI step is just:

```bash
tdk config verify
```

If it fails, the job fails. The agent's edit never reaches `main`, and the fix is the command the output names. Keep the generated files in git, because the check compares against what is committed.

## Try it

The [tdk-example landscape](https://github.com/flisk-sh/tdk-cli-core/tree/main/examples/tdk-example) is a small working stack with an API, PostgreSQL, a NATS worker and a UI. Run `tdk project --yes`, then `tdk config verify`, and you have the check running on a real project. The [one-backend example](https://github.com/flisk-sh/tdk-cli-core/tree/main/examples/one-backend) is the smallest version if you only want the agent and MCP resources.

Next step: the [quickstart](https://flisk.sh/docs/quickstart/) gets you from zero to `tdk up` in a few minutes.
