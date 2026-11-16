# Flisk directory submission pack

Goal: raise flisk.sh Domain Rating (7 on 2026-11-16) with 20-40 real directory listings. Fill each form by copy-paste from this file. Do not submit through paid "guaranteed DR" services: the YourWebsiteScore guide warns they use spam networks that can hurt rankings.

## Copy (reuse everywhere)

| Field | Value |
|---|---|
| Name | Flisk |
| URL | https://flisk.sh |
| Repo | https://github.com/flisk-sh/flisk |
| npm | https://www.npmjs.com/package/@flisk-sh/flisk |
| Docs | https://flisk.sh/docs |
| Discord | https://discord.gg/qMu5Xn8Kaq |
| Tagline (60) | Local dev for multi-service apps, in one command |
| Tagline (alt, 100) | Run your whole stack locally with one command: APIs, sites, workers, AI agents and databases. |
| Category | Developer Tools / Local Development / DevOps |
| Tags | local-development, microservices, docker, tilt, ai-agents, mcp, cli, live-reload |
| License | MIT |
| Pricing | Free and open source |
| First comment / try it | `npx @flisk-sh/flisk demo` |

**Short description (about 280 characters)**
Flisk is a command-line tool for local development. It runs every part of your app (API, website, workers, AI agents, database) on your computer with one command. Docker is optional: a small app runs as plain local processes, and a bigger one gets containers, one address in front of every part, and live reload.

**Long description**
Flisk runs a multi-service app on your laptop with one command. It finds your services from a small `service.json` per service, generates the local configuration (Vite, TSConfig, Compose, Tilt), and keeps everything live-reloading. A small app runs as plain local processes with no Docker; a bigger one gets containers, one gateway address and golden-image caching. It ships with starter templates (including a multi-agent stack with tools, a database and messaging), an MCP server so AI coding agents can create, start, inspect and restart services, and a one-command demo: `npx @flisk-sh/flisk demo`. Flisk is for local development only: it does not replace Kubernetes, Helm or your production orchestrator.

## Assets

- Logo: `flisk-emoji/apps/flisk-cli.svg` (export a 512x512 PNG; most forms want PNG)
- Hero image: not prepared yet; take a 1200x630 screenshot of flisk.sh
- Screenshot: the demo menu app after `npx @flisk-sh/flisk demo`

## Already listed (skip)

Toolradar, SaaSHub, AlternativeTo, SourceForge, Cursor Directory, mcpservers.org, mcp.directory, Terminal Trove, Uneed, Homebrew tap, Scoop bucket, Show HN (2026-10-21). Indie Hackers page exists but posting is gated.

## To do, highest authority first (check each site's current DR and dofollow status before spending time)

Tier A: large sites, mostly nofollow but strong signal and traffic
1. Product Hunt launch (needs a launch day plan)
2. dev.to article (draft exists: `docs/outreach/devto-flisk-article.md`; the profile link and canonical URL give a dofollow link)
3. Hashnode or Medium cross-post of the same article
4. GitHub topics and `awesome-*` lists with under 500 stars of risk: skip lists above the 500-star cap (see memory); only open PRs to smaller, relevant lists
5. Docker Hub description link back to flisk.sh (done through the mirror; verify the link)
6. `cli/package.json` `homepage` is https://flisk.sh, so the npm page links the site (set in the release after this pack landed)

Tier B: developer tool directories
7. StackShare (tool page plus "alternatives to Tilt/Skaffold")
8. Slant, LibHunt (Awesome/Show), OpenSourceAlternative.to, Openbase-style catalogues
9. DevHunt (devhunt.org), Peerlist Launchpad, Microlaunch, Fazier, TinyLaunch, BetaList (free queue), Launching Next
10. Console.dev (email tip), Changelog News (submission form), Hacker Newsletter, TLDR (only with a real announcement)
11. Crunchbase and G2/Capterra listings (free company profile)

Tier C: AI-agent angle (matches the agent-stack template and MCP server)
12. There's An AI For That, Futurepedia-style tool lists (only those with a free listing)
13. Smithery, Glama, PulseMCP, mcp.so, official MCP Registry (see skill `flisk-list-marketplaces` for the ones already done)
14. Awesome MCP lists (small ones)

Use LaunchDirectories.com or SubmitSaaS.com to filter a longer list by DR, then submit yourself, as the guide suggests.

## Rules for this pack

- One honest description. Do not claim numbers that are not on flisk.sh.
- Nofollow links still count: submit anyway.
- Log every submission with date and URL in `docs/outreach/` or the directory-listings memory, so nothing is submitted twice.
- Check the site's current rules first: some reject open-source CLI tools, some ask for a reciprocal link (skip those).
