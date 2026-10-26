# Lab 1: Check your machine

**Goal:** know that Docker, Tilt, and your ports are ready before you build anything.
**Time:** 5 minutes. **Next:** [Lab 2](02-create-a-project.md).

## Steps

1. Check that Flisk is installed:

   ```bash
   flisk --version
   ```

   You should see a version number such as `1.4.0`.

2. Run the readiness check:

   ```bash
   flisk doctor
   ```

## You should see

A list of checks, each starting with a symbol:

```text
✓ Ingress ports 80/443 are free for Traefik
✓ Docker daemon is running
✓ Tilt v0.37.7, built 2026-08-15 is available
✓ Docker Compose plugin available
✓ Dev ports bind to 127.0.0.1 (this machine only)
○ Not in a project - skipping Bun check
...
✓ Doctor passed. Next: flisk project example
```

Your versions and numbers will differ.

| Symbol | Meaning |
| --- | --- |
| `✓` | Ready. |
| `⚠` | A warning with a `Fix:` line. Read it, but you can often continue. |
| `○` | Skipped. For example, the Bun check waits until you are inside a project. |
| `✗` | A problem you must fix before `flisk up` will work. |

## What just happened

`flisk doctor` looked at your machine only. It checked that Docker is running, that Tilt exists, that the ports Flisk wants are free, and that Docker can create networks. It changed nothing.

If port 80 is taken, Flisk picks another port by itself and prints it when you start. You can force one later with `FLISK_HTTP_PORT`.

## Ask your AI agent instead

```text
Run flisk doctor, explain every warning and error in plain words, and fix what you can. Then tell me if I am ready to start a Flisk project.
```

## Checkpoint

- [ ] `flisk --version` prints a version.
- [ ] `flisk doctor` has no `✗` lines.

## Stuck?

- **`flisk: command not found`:** run `npm install -g @flisk-sh/flisk`, then open a new terminal.
- **`Docker daemon is not running`:** start Docker Desktop (or your Docker engine) and run `flisk doctor` again.
- **Two Flisk installs warning:** keep one. Remove the others or run `flisk upgrade`.
