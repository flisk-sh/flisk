# Lab 13: Stop, clean up, and what next

**Goal:** shut everything down, keep Flisk current, know what you would keep if you stopped using it, and choose your next step.
**Time:** 5 minutes. **Previous:** [Lab 12](12-work-with-an-ai-agent.md).

## Steps

1. Stop the stack:

   ```bash
   flisk down
   ```

2. Check that nothing is running:

   ```bash
   flisk status
   ```

3. Update Flisk:

   ```bash
   flisk upgrade
   ```

4. See what Flisk generated and would leave behind. This changes nothing:

   ```bash
   flisk eject --dry-run
   ```

5. Turn on shell completion (optional):

   ```bash
   flisk completion --install
   ```

## You should see

After `flisk down`, `flisk networks --stack shop` shows each service as `✗ [stopped]`. `flisk eject --dry-run` lists the generated files under `.flisk/.flisk-out/`, which are git-ignored.

## What just happened

`flisk down` stops the containers of this project. Your code, your `service.json` files, and your `.env` stay where they are. Agent checkpoints are kept in Docker volumes, so they survive a `down`.

`flisk eject` does not turn your project into plain Compose. It documents what Flisk generated. Read [leaving Flisk](../leaving-flisk.md) for what you keep: your code, your own Dockerfiles, and your `service.json` files. It also says plainly what you would have to rebuild.

Flisk is for local development. Production deployment stays with Helm, Argo CD, or Kustomize ([Flisk and Helm](../with-helm.md)).

## Ask your AI agent instead

```text
Stop my Flisk stack with flisk down and confirm nothing is left running. Then tell me which Flisk version I have and whether an upgrade is available.
```

## You finished Flisk 101

You can now create a project, add APIs, websites, workers, MCP servers, and agents, start a stack, change code live, read logs, restart a service, change `service.json`, understand drift, and let an AI agent do all of it.

## Where next

| I want to... | Go to |
| --- | --- |
| Try a bigger, runnable stack | [Examples](../../README.md#examples) |
| Look up any command | [Cheat sheet](../cheat-sheet.md) |
| Understand what happens inside `flisk up` | [How `flisk up` works](../how-flisk-up-works.md) |
| Run AI agents, MCP tools, and a database together | [AI agents guide](../agents/ai-agents.md) |
| Add Flisk to a project you already have | [Adopt Flisk](../adopt-flisk.md) and [bring your own](../byo.md) |
| Keep using Helm for clusters | [Flisk with Helm](../with-helm.md) |
| Fix something broken | [Troubleshooting](../troubleshooting.md) |
| Help improve Flisk | [Contributing](../contributing/README.md), and say hello in the [Discord](https://discord.gg/Sjhb3tnq3) |

## Checkpoint

- [ ] `flisk status` shows nothing running.
- [ ] You know what `flisk eject` does and does not do.
- [ ] You picked a next step.
