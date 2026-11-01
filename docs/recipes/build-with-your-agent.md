# Build it with your AI agent: a gallery of prompts

Pick what you want, copy the prompt into your coding agent (Claude Code, Codex, Cursor, Copilot or any agent that can run commands), and it builds the app and runs it on your laptop. You get a link to open when it is ready.

First install Flisk once, and give your agent the Flisk skills (they are in [`.agents/skills`](../../.agents/skills); copy the `flisk-*` folders into your project's `.claude/skills` or `.agents/skills`):

```bash
npm install -g @flisk-sh/flisk
```

Each entry says what you get and, folded away, the Flisk steps your agent runs. The `flisk-build` skill turns any of these prompts into those steps; you do not need to type them.

Some entries start from a **starter app**: a working multi-service app in the [flisk-sh](https://github.com/flisk-sh) organisation that `flisk project <template>` clones (restaurant, SaaS, store, AI agent stack, user management). The `flisk-recipe-starters` skill picks one when your request matches.

People have already asked for apps like these: by 26 Oct 2026 the [demo.flisk.sh](https://demo.flisk.sh) bot, which builds a stack when you mention it on X, had made 215 demos in [flisk-sh/demos](https://github.com/flisk-sh/demos) (one branch each, counted from the branch names: 175 web apps, 17 web3 apps, 12 agent stacks, 9 stores). The categories below follow what it builds.

## Spreadsheets and data

### A shared spreadsheet for your team

```text
Build me a simple shared spreadsheet app: a grid I can type into, named sheets, and a CSV import. Save everything in a database and run it on my laptop with Flisk.
```

You get: a spreadsheet page in your browser and a place where the sheets are saved, so they are still there tomorrow.

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource sheets --type frontend --stack sheets --yes
flisk resource sheets-api --type backend --stack sheets --feature drizzle --yes
flisk resource imports --type worker --stack sheets --yes
flisk up sheets
```

</details>

### Turn a CSV into a dashboard

```text
Build me a small dashboard: I upload a CSV of sales, it shows totals per month and a chart. Run it on my laptop with Flisk.
```

You get: an upload page and a dashboard page that remembers past uploads.

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource dashboard --type frontend --stack data --yes
flisk resource reports-api --type backend --stack data --feature drizzle --yes
flisk up data
```

</details>

## For recruiters

### A candidate pipeline

```text
Build me a candidate tracker for hiring: a board with columns (applied, phone screen, interview, offer), a card per candidate with notes and a CV link, and a search. Run it on my laptop with Flisk.
```

You get: a hiring board in your browser that keeps every candidate and note.

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource hiring --type frontend --stack hiring --yes
flisk resource candidates-api --type backend --stack hiring --feature drizzle --yes
flisk resource reminders --type worker --stack hiring --yes
flisk up hiring
```

</details>

### Interview scorecards

```text
Build me an interview scorecard app: interviewers fill in a short form per candidate, and I see everyone's scores side by side. Run it on my laptop with Flisk.
```

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource scorecards --type frontend --stack interviews --yes
flisk resource scores-api --type backend --stack interviews --feature drizzle --yes
flisk up interviews
```

</details>

## For product managers

### A roadmap and feedback board

```text
Build me a product feedback board: people post ideas, vote on them, and I move the top ones onto a now / next / later roadmap. Run it on my laptop with Flisk.
```

You get: a public-style feedback page and a roadmap page, with votes saved.

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource feedback --type frontend --stack product --yes
flisk resource ideas-api --type backend --stack product --feature drizzle --yes
flisk up product
```

</details>

### A release notes page with an editor

```text
Build me a release notes site: a public page with every release, and an admin API I can post new notes to. Run it on my laptop with Flisk.
```

This is the blog recipe with a different name: see the `flisk-recipe-blog` skill.

## Shops and bookings

### A small online shop

```text
Build me a small online shop with a storefront and an orders API, and run it on my laptop with Flisk.
```

See the `flisk-recipe-shop` skill, or start from the store starter (`flisk project ecommerce`: a Vue storefront and a catalog API).

### A restaurant: bookings, kitchen and floor

```text
Build me a restaurant app with Flisk: guests book a table, the kitchen sees orders, and staff see the floor plan. Run it on my laptop.
```

You get: a booking website, a floor website for staff, and APIs for reservations, the kitchen and the menu, with a kitchen worker. It starts from the restaurant starter.

<details><summary>What your agent runs</summary>

```bash
flisk project restaurant --path my-restaurant --yes
cd my-restaurant
flisk project --yes
flisk up guest
```

</details>

### Table bookings only

```text
Build me a booking page for a restaurant: guests pick a time and party size, and I see today's bookings on an admin page. Run it on my laptop with Flisk.
```

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource bookings --type frontend --stack bookings --yes
flisk resource admin --type frontend --stack bookings --yes
flisk resource bookings-api --type backend --stack bookings --feature prisma --yes
flisk up bookings
```

</details>

## Apps with accounts

### A SaaS with login and billing

```text
Build me a SaaS starter with sign-up, login and a billing page with two plans, and run it on my laptop with Flisk.
```

See the `flisk-recipe-saas` skill, or start from the SaaS starter (`flisk project saas`: a dashboard, a checkout page and a billing API). No real payments are taken unless you give your agent a payment provider's test key.

### User accounts with an admin portal

```text
Use Flisk to give me user management on my laptop: an admin site to manage users, a self-service portal, and an audit log.
```

<details><summary>What your agent runs</summary>

```bash
flisk project user-management --path my-users --yes
cd my-users
flisk project --yes
flisk up admin
```

</details>

## AI agents

### An AI agent with tools and a database

```text
Use Flisk to build me an AI agent with an MCP tools server and a database, run it on my laptop, and tell me how to talk to the agent.
```

See the `flisk-recipe-ai-agent` skill, or start from the agent stack starter (`flisk project agent-stack`: an agent with its database migrator and an MCP tools server). For several agents working together, `flisk project swarm` (a coordinator and three workers that retry a task whose worker died) and `flisk project security` (scanner, triage and reporter agents) run as local processes with no Docker.

### A helper that answers questions about your notes

```text
Build me an assistant that saves my notes and answers questions about them, with its tools in an MCP server. Run it on my laptop with Flisk.
```

<details><summary>What your agent runs</summary>

```bash
flisk project --yes
flisk resource assistant --type agent --stack notes --yes
flisk resource notes-mcp --type mcp --stack notes --yes
flisk resource notes-api --type backend --stack notes --feature drizzle --yes
flisk up notes
```

</details>

## Websites and content

### A blog with an admin API

```text
Build me a blog with an admin API for writing posts, and run it on my laptop with Flisk.
```

See the `flisk-recipe-blog` skill.

## Not covered yet

Web3 apps (a local chain node, contracts and an indexer) are among the demo bot's requests, but no Flisk recipe has run a chain node end to end, so there is no entry for them here.

## What was checked

With Flisk 1.4.2 on 26 Oct 2026:

- The shop steps (a website and an API) and the AI agent steps (an agent, an MCP tools server and an API with a database) were run end to end, and every health URL answered.
- Every other block was run up to `flisk up --dry-run`, which lists the services and URLs without starting them. That includes each starter after `flisk project --yes`.
- The starters ship `.flisk/project.json`, so `flisk up` works right after cloning; the `flisk project --yes` lines in those blocks are safe but not required. The app code itself is written by your agent, so its quality depends on the agent.

When something does not start, ask your agent to run `flisk doctor` and explain the result in plain words.
