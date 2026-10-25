# Flisk 101

A hands-on course in 13 short labs. You start with an empty folder and finish with a running shop (an API and a website), a database, live reload, and a clear idea of what Flisk wrote for you.

You do not need to know Docker. If you work with an AI coding agent, every lab has a prompt you can paste instead of typing the commands yourself.

**Time:** about 90 minutes in total. Each lab takes 5 to 10 minutes and ends with a checkpoint.

## Before you start

Install these once:

- [Node.js](https://nodejs.org/) 22.12 or newer
- [Docker](https://docs.docker.com/get-docker/), running (Engine 25+, Compose 2.20.2+)
- [Tilt](https://docs.tilt.dev/install.html)
- [Bun](https://bun.sh/) 1.2 or newer
- Flisk itself:

```bash
npm install -g @flisk-sh/flisk
```

Lab 1 checks that all of this works. On Windows, use WSL2 Ubuntu ([WSL2 setup](../wsl2.md)).

## The labs

| Lab | You will | Time |
| --- | --- | --- |
| [1. Check your machine](01-check-your-machine.md) | Run `flisk doctor` and read the result | 5 min |
| [2. Create a project](02-create-a-project.md) | Turn an empty folder into a Flisk project | 5 min |
| [3. Add an API](03-add-an-api.md) | Scaffold a backend with one command | 5 min |
| [4. Add a website](04-add-a-website.md) | Scaffold a frontend and group both into a stack | 5 min |
| [5. Preview, then start](05-preview-then-start.md) | See what will run, then start it | 10 min |
| [6. See it run](06-see-it-run.md) | Find your URLs and check that the services answer | 5 min |
| [7. Change code, see it live](07-change-code-see-it-live.md) | Add an endpoint and watch it appear without a rebuild | 10 min |
| [8. Logs, restart, and the dashboard](08-logs-restart-dashboard.md) | Look inside a running stack | 5 min |
| [9. What Flisk wrote, and drift](09-generated-files-and-drift.md) | Explore the generated files and see why hand edits are blocked | 10 min |
| [10. Change a service.json](10-change-a-service-json.md) | Change a port and a startup order | 10 min |
| [11. More kinds of service](11-more-kinds-of-service.md) | Add a worker, an MCP tools server, and an AI agent | 10 min |
| [12. Work with an AI agent](12-work-with-an-ai-agent.md) | Let your coding agent drive Flisk | 10 min |
| [13. Stop, clean up, and what next](13-stop-clean-up-next.md) | Shut down, upgrade, and decide where to go | 5 min |

## Words you will see

| Word | Plain meaning |
| --- | --- |
| **Project** | Your whole folder. Flisk keeps its settings in `.flisk/project.json`. |
| **Stack** | A group of services that start together, such as `shop`. |
| **Resource** or **service** | One running part: an API, a website, a worker, an agent. |
| **`service.json`** | The one file you write per service. Flisk generates everything else from it. |
| **Gateway** | One local front door (Traefik) that routes names like `api.my-shop.localhost` to the right service. |
| **Tilt** | The tool that builds and live-updates your containers while you code. Flisk runs it for you. |

## If something goes wrong

- Run `flisk doctor`. It names the problem and the fix.
- See [troubleshooting](../troubleshooting.md).
- Ask in the [Flisk Discord](https://discord.gg/Sjhb3tnq3) or [open an issue](https://github.com/flisk-sh/flisk/issues/new/choose).

When you finish, the [examples](../../README.md#examples) and the [Flisk cheat sheet](../cheat-sheet.md) are good next stops.
