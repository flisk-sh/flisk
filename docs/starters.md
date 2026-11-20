# Starters

`flisk project <key>` writes or clones a ready-made Flisk project. The same list is printed by `flisk project --list` (and by `flisk project --list --json` for scripts), and `flisk create my-app --starter <key>` offers it in the guided creator. A key can also be used directly, for example `flisk saas`.

The table below is checked by `cli/src/utils/__tests__/starter-docs.test.ts`. Keys and descriptions come from `PROJECT_TEMPLATES`, the registry behind `flisk project --list`; the Docker column comes from the same `starterCatalog()` the CLI uses for `flisk create --starter`. A new starter key needs a row here.

## All starters

<!-- starter-table:start -->
| Key | What it builds | Needs Docker? | Example command |
| --- | --- | --- | --- |
| `demo` | Restaurant demo: take table bookings, run the kitchen and manage the dining room | Yes | `flisk project demo` |
| `restaurant` | Restaurant app: table bookings, kitchen orders and the dining room in one place | Yes | `flisk project restaurant` |
| `saas` | Online subscription app: a customer account page and a working payment button | Yes | `flisk project saas` |
| `erp` | Company back office: 100 small services for sales, stock, finance and more | Yes | `flisk project erp` |
| `user-management` | Sign-up and log-in: user accounts, passwords and who may do what | Yes | `flisk project user-management` |
| `ecommerce` | Online shop: a shop front with a product catalogue | Yes | `flisk project ecommerce` |
| `example` | Order tracker: a web page that saves orders and finishes work in the background | Yes | `flisk project example` |
| `agent-stack` | AI assistant: an assistant that can use tools and remember what it did | Yes | `flisk project agent-stack` |
| `swarm` | AI team: one assistant splits a goal into tasks and three helpers finish them | No | `flisk project swarm` |
| `security` | Security checker: one assistant scans, one sorts what it found, one writes the report | No | `flisk project security` |
| `super-agent` | AI researcher: plans a task, looks things up, writes and checks the result (uses Claude when you add an Anthropic key) | No | `flisk project super-agent` |
| `langgraph` | Step-by-step AI writer: plans, researches, writes and checks, and picks up where it stopped | No | `flisk project langgraph` |
| `tool-loop` | Simple AI helper: an assistant that uses tools, with a practice model so it works offline | No | `flisk project tool-loop` |
| `next-postgres` | Next.js + Postgres app: a website with a working add, tick and delete list, an API and a migrator (needs Docker) | Yes | `flisk project next-postgres` |
| `launch` | Launch page: a ready-to-publish website with a search-friendly page, icons and a small data feed | Yes | `flisk project launch` |
| `portal` | Developer portal: sign in with GitHub, hand out access keys and see who uses what | Yes | `flisk project portal` |
| `fullstack` | Full app to build on: a website, the part behind it, background jobs and a database | Yes | `flisk project fullstack` |
<!-- starter-table:end -->

"Needs Docker?" follows the CLI's own starter catalog: the five generated AI starters (`swarm`, `security`, `super-agent`, `langgraph` and `tool-loop`) run as local processes with no Docker or Tilt; every other starter is a container stack and needs Docker (on Windows, use Ubuntu on WSL2 — see [start here on Windows](start-here-on-windows.md)). Even a starter with no database of its own, such as `launch`, is started by Flisk as a container stack. A starter's own README is the source of truth for API keys, extra tools and what it does not do.

The local-process AI starters are described in more depth in [AI agents in Flisk](agents/ai-agents.md); the bundled service layouts of several others are in [Examples and starter repositories](examples/README.md).

## Launch, portal and fullstack

These three are pinned to a commit in `PROJECT_TEMPLATES`, so `flisk project` always checks out the same version. Each needs Docker; the commands below clone the starter, then start it:

```bash
flisk project launch --path my-launch    # SEO-ready one-page product site
cd my-launch && flisk up

flisk project portal --path my-portal    # GitHub sign-in, API keys and usage
cd my-portal && flisk up

flisk project fullstack --path my-app    # web, API, background jobs and Postgres
cd my-app && flisk up
```

`launch` needs no database and no API keys; its Docker requirement comes from the Flisk container stack (proxy), not from a database. `portal` can also run its single Bun service directly without Flisk (see its README); the Flisk route is a container stack. `fullstack` needs Docker, Bun and `bun install` for its Postgres, migrations, API, worker and web app.

Pass `--list` to see every key with its repository, description and pinned ref:

```bash
flisk project --list
flisk project --list --json
```
