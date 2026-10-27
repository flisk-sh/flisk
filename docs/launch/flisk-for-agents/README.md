# Launch kit: Flisk for AI agents (Product Hunt, Wed Oct 28, 2026)

Everything the maker needs to post "Flisk for AI agents" on Product Hunt and to talk about it elsewhere. Nothing in this folder has been posted. Posting, scheduling, commenting and voting are human actions done by the maker from their own personal account; no agent posts or votes.

- [lessons-learned.md](lessons-learned.md): what the Oct 27 Flisk launch taught, and what changes.
- [checklist.md](checklist.md): the next 24 hours, in Pacific time.
- [gallery/](gallery/): the five gallery images (SVG source and PNG), and the script that writes them.

Before anything goes out, check two open items:

1. **The connect command.** The one-command connect is being built on the `feat/flisk-for-agents` branch and is not on `main` yet. The working name is flisk connect followed by the host (claude, cursor or codex). This kit uses the commands that work today (the per-host setup in [Set up the Flisk MCP server](../../agent-tooling/flisk-mcp-setup.md)). When the connect command merges, put its real name and flags into the first comment, the posts below and gallery card 2 (`CONNECT` in [gallery/build.mjs](gallery/build.mjs)), and run it once on a clean machine first.
2. **The landing page.** flisk.sh/agents is being built. Until it answers, use the repository link (https://github.com/flisk-sh/flisk) as the product link.

## What the product is (one paragraph, for anyone writing about it)

Flisk for AI agents gives a coding agent (Claude Code, Cursor or Codex) the Flisk runtime: the `flisk mcp` server, which ships inside the Flisk CLI and exposes 19 tools, plus the Flisk agent skills. With them the agent can create a project, add services, start the stack on Docker and Tilt, check readiness, read logs and restart what broke, instead of hand-writing Compose files and guessing. The core is MIT and needs no key or account. It runs on the user's machine; it is not a hosted service and not a deploy tool.

Facts this rests on (check before you repeat them):

| Fact | Where it is checked |
| --- | --- |
| `flisk mcp` has 19 tools | `cli/src/mcp/tools.ts`; a `tools/list` call against the CLI built from `main` returned 19 names on 2026-10-27, and the published `@flisk-sh/flisk` 1.4.8 package contains `project_init` and `stack_assign` |
| Claude Code, Cursor, Codex (and Claude Desktop) are supported clients | [Set up the Flisk MCP server](../../agent-tooling/flisk-mcp-setup.md) |
| Skills | [flisk-skills](https://github.com/flisk-sh/flisk-skills), installed with `npx skills add flisk-sh/flisk-skills`; `flisk project` also adds `.claude/skills`, `.agents/skills` and `AGENTS.md` to a new project (seen in a real `project_init` call) |
| MIT core, no key | [LICENSE](../../../LICENSE), and the license boundary in GOVERNANCE.md |
| Needs Docker and Tilt to start a stack; native Windows needs WSL2 for `flisk up` | [docs/wsl2.md](../../wsl2.md) and the setup page |

No performance numbers appear in this kit. If someone asks for one, use only the wording in [docs/claims.md](../../claims.md), with its caveat.

## Product Hunt listing

**Name:** Flisk for AI agents

**Tagline** (Product Hunt allows 60 characters). Options:

| # | Tagline | Characters |
| --- | --- | --- |
| 1 | Let your coding agent build and run your local stack | 52 |
| 2 | Claude Code, Cursor and Codex, now with a local runtime | 55 |
| 3 | 19 MCP tools so your AI agent can run the whole stack | 53 |

**Chosen: 1, "Let your coding agent build and run your local stack".** It says who acts (your agent), what it does (build and run) and where (local), without a number to defend or a list of brand names that reads like a partnership. Option 2 names the hosts, which is good for search but says less about the outcome; option 3 leads with a count, which is accurate but not a reason to care.

**Description** (259 characters; Product Hunt allows up to 500, the kit keeps it to 260 so it fits a card):

> Connect Claude Code, Cursor or Codex to the Flisk runtime: the flisk mcp server with 19 tools, plus the Flisk skills. Your agent scaffolds services, starts the stack on Docker and Tilt, reads status and logs, and fixes what broke. Free MIT core, runs locally.

**Launch tags** (Product Hunt allows three): Developer Tools, Artificial Intelligence, Open Source.

**Links:** the repository (https://github.com/flisk-sh/flisk) as the main link until flisk.sh/agents answers; then the landing page, with the repository as the second link.

**Thumbnail:** the existing Flisk mark, 240x240, under 3 MB. Do not reuse the Oct 27 listing's gallery.

**Makers:** the maker posting, plus any maintainer who will answer comments during the day (each from their own personal account; Product Hunt does not allow company accounts to post or comment).

## Maker first comment

Post it right after the listing goes live (it can also be added when scheduling). Plain words, no request for votes.

> Hi, I'm one of the people who make Flisk. Yesterday we put the Flisk CLI itself on Product Hunt. Today is the part we use most ourselves: handing a local stack to a coding agent.
>
> What it is: the flisk mcp server that ships inside the Flisk CLI (19 tools such as doctor, project_init, resource_create, up, status, logs and restart_resource) plus the Flisk skills. Connect it to Claude Code, Cursor or Codex, and the agent can create the project, add services, start them on Docker and Tilt, check which ones are ready and read the logs of the one that failed, instead of writing Compose files by hand and guessing.
>
> What it is not: it is not hosted and not a deploy tool. It runs on your machine and needs Docker and Tilt to start a stack. On Windows it needs WSL2. The core is MIT and needs no key or account.
>
> It is early, and some things are rough: the first build of a stack can take minutes, and we have only tried it on the setups we have.
>
> What would you want your agent to be able to do with your local stack that it cannot do today?

About 170 words. If the connect command has merged, add one line after the second paragraph with the exact command, for example "One command connects it: (the command)". Do not add it before it works on a clean machine.

## Gallery

Product Hunt recommends 1270x760 images, at least two, each under 3 MB. Upload in this order. The SVG files are written by [gallery/build.mjs](gallery/build.mjs) and the PNG files are rendered from them with headless Chrome. To change a card, edit the script, then run from the repository root (macOS):

```bash
bun docs/launch/flisk-for-agents/gallery/build.mjs
cd docs/launch/flisk-for-agents/gallery
for f in *.svg; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1270,760 --screenshot="$PWD/${f%.svg}.png" "file://$PWD/$f"
done
```

| # | File | What it shows | Alt text |
| --- | --- | --- | --- |
| 1 | `gallery/01-title.png` | The name, the chosen tagline, the three hosts and the five verbs (scaffold, start, check, read logs, fix) | Flisk for AI agents: let your coding agent build and run your local stack |
| 2 | `gallery/02-connect.png` | The per-host commands that connect Claude Code, Codex and Cursor to `flisk mcp`, plus the skills install, and the CLI install line | The commands that connect Claude Code, Codex and Cursor to the Flisk MCP server |
| 3 | `gallery/03-agent-tools.png` | The 19 tool names, grouped as Build, Run, Check, Observe and Agents | The 19 tools of the Flisk MCP server, grouped by what an agent does with them |
| 4 | `gallery/04-transcript.png` | An agent session: project_init, two resource_create calls, doctor, up and status, with output from a real run | An AI agent creates a two-service shop with the Flisk MCP tools and starts it |
| 5 | `gallery/05-free-local-mit.png` | Free, local, MIT, and the install command | Flisk for AI agents is free, runs locally and is MIT licensed |

Card 4 is the only one with tool output. Every tool line on it was copied from real `flisk mcp` calls on 2026-10-27 (the CLI built from `main`, macOS with Colima and Tilt v0.37.8), trimmed but not reworded; the earlier `status` polls that returned `ready: false` while images built are cut. The prompt and the closing sentence are the agent's words, not tool output. If the video is recorded on a different machine, the ports in the URLs will differ; that is expected (Flisk picks a free port from a fallback range).

## Video (60 to 90 seconds)

Record a real session; do not stage output. Screen at 1920x1080, terminal font at 18 pt or larger, no music under the voice. Use a fresh empty folder and a machine where `flisk doctor` already passes (images may already exist, so do not describe the start time as a cold start). If the first build takes longer than the cut allows, cut the wait and say on screen that it was cut.

| # | Time | Screen | Voice-over |
| --- | --- | --- | --- |
| 1 | 0:00-0:06 | Gallery card 1 | "This is Flisk for AI agents. It lets your coding agent build and run your local stack." |
| 2 | 0:06-0:18 | Terminal in an empty folder: the Claude Code connect command (card 2), then `/mcp` inside Claude Code showing flisk connected | "Connect it once. Here it is Claude Code; Cursor and Codex work the same way." |
| 3 | 0:18-0:28 | Type the prompt: "Build a small shop: a storefront and an orders API. Start it and check it." | "Then ask for what you want, in plain words." |
| 4 | 0:28-0:45 | The agent calls `project_init` and `resource_create` twice; show the "Resource created successfully" lines | "The agent creates the project and the two services through Flisk's tools. Each service gets one service.json." |
| 5 | 0:45-0:60 | The agent calls `doctor`, then `up`, then `status` until both services are ready (cut the wait, with an on-screen "build cut") | "It checks the machine, starts the stack on Docker and Tilt, and checks which services are ready." |
| 6 | 0:60-0:72 | Open the storefront URL the agent printed in a browser | "Both parts are running on this laptop, at local URLs." |
| 7 | 0:72-0:80 | Optional, if it happened naturally in the recording: a failing service, the agent calling `logs`, fixing the file and calling `restart_resource` | "When something fails, it reads the logs and restarts what it fixed." |
| 8 | 0:80-0:88 | Gallery card 5 | "Free, MIT, and it runs on your machine. Not a deploy tool." |

Do not fake scene 7. If no failure happened, drop it and keep the video at about 75 seconds.

## Posts for other channels

Post these only after the Product Hunt listing is live, from the maker's own accounts. None of them asks for votes. A link to the listing is fine; asking people to upvote it is not.

### X (one post, under 280 characters)

> Flisk for AI agents: connect Claude Code, Cursor or Codex to the flisk mcp server (19 tools) and the Flisk skills, and your agent can scaffold, start, check and fix a local stack on Docker and Tilt. MIT, runs on your machine.
>
> (Product Hunt link)

Follow-up reply in the same thread, with gallery card 4 attached:

> What the agent actually calls: project_init, resource_create, doctor, up, status, logs. Output in the image is from a real run.

### LinkedIn

> Yesterday we put the Flisk CLI on Product Hunt. Today it is the part we use most ourselves: Flisk for AI agents.
>
> It connects a coding agent (Claude Code, Cursor or Codex) to the flisk mcp server that ships inside the Flisk CLI, plus the Flisk skills. With its 19 tools the agent can create a project, add services, start them on Docker and Tilt, check readiness, and read the logs of whatever failed.
>
> What it is not: it is not hosted and not a deploy tool. Production stays on whatever you use today. The core is MIT and needs no key.
>
> If you try it, I would like to hear where it broke for you, in the Product Hunt comments or as a GitHub issue.
>
> (Product Hunt link) · https://github.com/flisk-sh/flisk

### Discord (Flisk server, announcements)

> Flisk for AI agents is on Product Hunt today. It is the flisk mcp server and the Flisk skills, packaged so Claude Code, Cursor or Codex can scaffold, start, check and fix a local stack. Setup per host: https://github.com/flisk-sh/flisk/blob/main/docs/agent-tooling/flisk-mcp-setup.md
>
> If you have tried Flisk with an agent, the most useful thing you can do is say what broke, here or on the listing. (Product Hunt link)

### Hacker News

Do not post a second Show HN on launch day. The Show HN for the Flisk CLI is planned in [docs/marketing/launch-plan.md](../../marketing/launch-plan.md), and Hacker News flags a resubmission of the same repository URL. If the maker wants an HN post about the agent side, use this as a comment in the existing Show HN thread when someone asks about agents, not as a new submission:

> The agent side is the flisk mcp server that ships in the CLI: 19 tools (doctor, up, status, logs, resource_create, config_verify and so on) over stdio. Each tool runs the same CLI command and returns its JSON envelope or text output, so what the agent sees is what you would see. Setup for Codex, Claude Code and Cursor: docs/agent-tooling/flisk-mcp-setup.md.

## Note to the four adopter teams

Send one personal message to each team (Lekast, MakeOffer, mfin.services, Red Moon Digital), from the maker, by whatever channel you already use with them. Change the first line per team so it is personal. Do not ask for votes, do not send the same text as a group message, and do not ask them to create Product Hunt accounts.

> Hi (name),
>
> Thanks again for running Flisk on your own code and for letting us list you as an adopter.
>
> Tomorrow we put a second thing on Product Hunt: Flisk for AI agents, which connects Claude Code, Cursor or Codex to the Flisk MCP server and skills so the agent can start and check your stack itself. Setup is here: https://github.com/flisk-sh/flisk/blob/main/docs/agent-tooling/flisk-mcp-setup.md
>
> I am not asking for an upvote. What would help is honest feedback: if someone on your team tries it with your real project, what did the agent get wrong, and what did it get right? A short reply, a GitHub issue, or a comment on the listing if you want it public, all work. If you have no time this week, that is completely fine.
>
> Thank you,
> (maker)
