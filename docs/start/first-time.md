# Never written code? Start here

You describe an app in plain words. An AI helper builds it. Flisk runs every part of it on your own computer, so you can
click around your app in your browser. No programming experience needed: you will copy and paste a few lines.

[← Back to the README](../../README.md) · [Words you'll see](words.md)

## What you need

- A Mac, a Linux computer, or a Windows PC. **On Windows**, do the [Windows setup](../setup/windows.md) first: Flisk runs
  inside the free Ubuntu app there.
- An AI coding helper: [Claude Code](../agents/claude-code.md), [Codex](../agents/codex.md) or
  [Cursor](../agents/cursor.md). Each one needs its own account.

## 1. Open the terminal

The [terminal](words.md#terminal) is a window where you type instructions instead of clicking.

- **Mac:** press Cmd and Space together, type `Terminal`, press Enter.
- **Windows:** open the **Ubuntu** app (after the [Windows setup](../setup/windows.md)).
- **Linux:** press Ctrl, Alt and T together.

Every grey box below is a [command](words.md#command): click its copy button, paste it into the terminal, press Enter.

## 2. Install Node.js

Flisk is installed with [Node.js](words.md#nodejs). Download it from [nodejs.org](https://nodejs.org/) (the "LTS" button,
version 22.12 or newer) and install it like any other app. Check it worked:

```bash
node --version
```

You should see a version number, like `v22.12.0` or higher.

## 3. Install Flisk

```bash
npm install -g @flisk-sh/flisk
```

Check it worked:

```bash
flisk --version
```

You should see a version number. If the install says `permission denied` or `EACCES`, use the installer instead, which needs
no Node.js at all:

```bash
curl -fsSL https://flisk.sh/install.sh | sh
```

## 4. Install your AI helper

Follow the first step on your helper's page: [Claude Code](../agents/claude-code.md), [Codex](../agents/codex.md) or
[Cursor](../agents/cursor.md). Then start it in a new folder for your app:

```bash
mkdir my-shop
cd my-shop
```

`mkdir` makes a folder; `cd` goes into it. Start your helper there (for Claude Code, type `claude` and press Enter).

## 5. Tell it what to build

Paste one of these [prompts](words.md#prompt) into your helper.

**Start small** (nothing else to install):

```text
Build me a small website with a back end that says hello,
and run it on my laptop with Flisk, without Docker.
```

**The shop from the demo** (it has a [database](words.md#database), so it needs [Docker](words.md#docker)):

```text
Build me a small online shop with a storefront and an orders API,
and run it on my laptop with Flisk.
```

Your helper creates the files, runs [`flisk up`](words.md#flisk-up), and tells you what it did. If something is missing on
your computer, it runs [`flisk doctor`](words.md#flisk-doctor), which says what to install. For the shop, that is usually
**Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop/): install it, open it once so it is
running, and ask your helper to try again.

## 6. Open your app

When it is running, Flisk prints links like `http://localhost:3000`. Open one in your web browser. That is your app, running
on your own computer ([localhost](words.md#localhost)): nobody else can see it.

Change something by asking your helper ("make the buttons green"). To stop the app, press Ctrl and C together in the window
where it runs, or ask your helper to run `flisk down`.

## Stuck?

- Ask your helper: "Run flisk doctor, explain every problem in plain words, and fix what you can."
- Look up a word in [Words you'll see](words.md).
- Ask a question in our [Discord](https://discord.gg/Sjhb3tnq3) or [open an issue](https://github.com/flisk-sh/flisk/issues).
