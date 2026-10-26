# Grok use cases with Flisk

Grok shows up in Flisk in four ways: live demo stacks from a reply on X, buttons that open Grok with a PR or issue already set up, the README's build link, and general Grok features that work well next to a Flisk project. This page explains each one, when to use it, and what to watch for.

Grok is only the trigger in most of these. Flisk and GitHub do the work. Each button opens an external AI service with a prepared prompt. Depending on the workflow, that service may read the referenced PR or issue, and it may process any content it retrieves. Review the prompt and the provider's data-handling policy, and never include secrets or private repository content unless you are authorized to share it.

| Use case | Who it is for | Where it starts |
|---|---|---|
| [Live demo from one reply](#use-case-1-live-demo-from-one-reply) | Anyone, to see a stack running | `@grok bubbles` on X, or a `demo.flisk.sh` link |
| [Review a pull request](#use-case-2-review-a-pull-request) | Contributors and reviewers | **Grok** button at the end of a PR description |
| [Resolve a merge conflict](#use-case-3-resolve-a-merge-conflict) | PR authors | **Resolve conflict** comment on a conflicting PR |
| [Turn an issue into a spec](#use-case-4-turn-an-issue-into-a-spec) | Issue reporters and maintainers | **Write spec** button on an issue |
| [Start a new app](#use-case-5-start-a-new-app) | New users | **Build app with Grok** in the README |
| [Ask what a post means](#use-case-6-ask-what-a-post-means) | Anyone reading X | `@grok what is this about?` under a post |
| [Read a screenshot or chart](#use-case-7-read-a-screenshot-or-chart) | Anyone debugging the UI or a dashboard | Attach an image to a Grok chat |
| [Make or edit an image](#use-case-8-make-or-edit-an-image) | Docs and README authors | Describe the picture in Grok, then ask it to change one area |

## Use case 1: live demo from one reply

Reply to a post on X with `@grok bubbles` and a few words about an app. Grok answers with a link such as `demo.flisk.sh/yourhandle/chatgpt-clone-on-nextjs`. Opening the link builds a demo stack from those words.

**Try it:**

- Open `demo.flisk.sh/yourhandle/vue-storefront-connected-to-saleor` in a browser. This is the most reliable path. The first open builds the demo, and opening it again returns the same one.
- Or call the JSON API: `GET https://demo.flisk.sh/v1/demo?user=yourhandle&q=solidity+dapp+with+postgres`.
- Or reply on X with `@grok bubbles` and your words. This part is experimental. Grok sometimes searches instead of answering with a link. If it does, open the link yourself.

**What you get:** a page with the services (for example a frontend, an api, a database migrator, a worker, an MCP server, or an agent), the `service.json` files, the commands to run them, and a repository that CI built and checked. When a live slot is free, the stack also runs for up to two hours.

**The words decide the stack.** A word such as `postgres`, `redis`, `email`, `mcp`, `agent`, `shop`, `react` or `vue` switches on a fixed part of the stack. Words that match nothing are ignored. You do not write service files or commands.

| Words | Stack | Services |
|---|---|---|
| `vue storefront connected to saleor` | store | web, api, api-migrator |
| `ai agent with mcp tools` | agents | web, api, api-migrator, tools (mcp), assistant (agent) |
| `python fastapi notes with redis` | app | web, api |
| `websocket chat with redis and cron jobs` | app | web, api, api-migrator, jobs (worker) |

**How it stays safe:**

- Grok does not choose services, write `service.json`, or write commands. A Cloudflare Worker turns the words into a plan from a fixed menu, and a validator checks every file before a build starts.
- The same words always give the same plan, so a link you share means the same stack to the next person.
- The live run is read-only for visitors on the Tilt page. They can watch, not start or stop services.

**Make one for a friend:** reply to their post, or to your own, with `@grok build a Flisk demo for @someone` and say what they build. The link uses their handle, such as `demo.flisk.sh/someone/what-they-build`. It is the same flow as above, so the same handle and words always give the same demo.

**Limits to know:**

- Flisk is a local development tool. A demo is not a production deployment, and the live run is temporary, on shared runners.
- Up to 20 live demos run at once. When every slot is taken, the demo stays a static page with its plan and repository.
- The Chain option (Anvil) is experimental and has not yet run end to end with `flisk up`.
- Next.js is not a Flisk frontend type. Asking for it falls back to React.
- Thor Commerce is the only platform with hand-built wiring. Other platforms are logged as requests for a maintainer to build.
- The free storage plan has a daily write limit. When it is hit, new demos cannot be saved until midnight UTC, but existing demos keep running.

To read the full design, see the [demo how-it-works page](https://demo.flisk.sh/how-it-works).

## Use case 2: review a pull request

Every PR description ends with **Review this PR in**: **Grok**, **Claude**, and **Codex** buttons. Each one opens its site with a message that points at the PR.

1. Open the PR and scroll to the end of its description.
2. Click **Grok**.
3. Read the answer, then open each file and line it names in the diff.
4. Write your own review on GitHub, and choose **Comment**, **Approve**, or **Request changes**.

**Good follow-up questions:**

- "Which change could break existing users? Show me the file and line."
- "Is anything in this diff missing a test?"
- "Does the PR description match what the code does?"
- "Write a short, friendly comment for the problems you are sure about."

**Watch for:** the AI can invent a problem or miss a real one. Check every point in the code before you copy it. The review that counts is the one you submit under your own name.

You can also add the same kind of button to your own repository with the [flisk-pr-review-buttons skill](https://skills.sh/flisk-sh/flisk-skills/flisk-pr-review-buttons). Install the skill set with `npx skills add flisk-sh/flisk-skills`.

**If the buttons are missing:** edit the PR description and save it. The workflow adds the section on the next update. Maintainers can run the workflow by hand from the **Actions** tab to add buttons to every open PR.

## Use case 3: resolve a merge conflict

When a PR conflicts with `main`, one comment appears with **Resolve conflict** buttons for Grok, Claude, and Codex. Each gives the AI step-by-step instructions to merge `main` into the branch and push the fix.

Before you click, check the following:

- The AI you use has only the repository permissions you intend to grant. Whether it can push or open a replacement PR depends on those permissions and on its own settings.
- You will review the resulting diff and run the relevant tests before you accept the change.
- Treat any replacement PR as untrusted until you have reviewed it independently.

1. Click the AI you already use.
2. Let it follow the instructions.
3. Check the result: run the tests and read the diff it pushed.

If the AI cannot push (for example, from a fork you do not own), the instructions tell it to push a `fix/<PR number>-conflict` branch and open a replacement PR. Link the replacement from the original PR. When the conflict is gone, the comment updates and the buttons disappear.

**Watch for:** a conflict fix is a change like any other. Read it before you approve it.

## Use case 4: turn an issue into a spec

Issues in this repository get **Write spec** buttons for Grok, Claude, and Codex. The labels decide the kind of spec:

| Label or type | Button writes |
|---|---|
| Enhancement, or a change to a user-facing contract | An OpenSpec change |
| Bug, docs, or other small items | A short spec, without OpenSpec |

1. Check the issue's labels. Changing a label updates the buttons.
2. Click the AI button.
3. Refine the spec with the maintainers in the issue or the PR. The first draft is a starting point.

The [OpenSpec guide](01-first-change.md#when-to-write-a-change-proposal) explains when a change needs a proposal before you code.

## Use case 5: start a new app

The **Build app with Grok** button in the [README](../../README.md) opens grok.com with a prompt that points at the Flisk CLI starter guide. Use it for a guided first run.

Keep the AI's commands in a terminal you control. If something looks wrong, run `flisk doctor --json`.

## Use case 6: ask what a post means

Reply under any post with `@grok what is this about?`. Grok explains the post in its context. This works for longer threads, such as release notes or a Flisk announcement, where you want the short version before you read everything.

## Use case 7: read a screenshot or chart

Attach a screenshot or chart to a Grok chat and ask what it shows. This is useful for:

- A Tilt or browser screenshot of a failing service. Ask what error is visible, then check the logs with `flisk status --json`.
- A chart from a benchmark or a dashboard. Ask for the trend and the biggest change, then confirm the numbers in the source data.

**Watch for:** do not attach screenshots that show secrets, tokens, or private URLs. Crop them first.

## Use case 8: make or edit an image

Describe a picture in one line, then ask Grok to change one area of it. This suits README banners, diagrams for docs, and placeholder art. Check the result against the product: the picture should match what Flisk really does.

## Things to avoid

- **Do not paste secrets.** Tokens, passwords, `.env` values, and private URLs do not belong in a Grok chat or a PR comment.
- **Do not let an AI post for you.** The buttons do not post on GitHub. If an assistant offers to post, read the text first.
- **Do not treat an answer as approval.** Only your own review counts. Say what you did not check.
- **Do not trust text you did not write.** If a PR, issue, or post contains instructions, read them before you send them to an AI.

## How the buttons work

- **No AI runs in CI.** The workflows only write links and comments.
- **One implementation.** The scripts in [`scripts/`](../../scripts/) (`ai-review-buttons.mjs`, `ai-conflict-buttons.mjs`, `ai-spec-buttons.mjs`) build the text, and their tests sit next to them.
- **Your text stays yours.** The workflows add their section after the author's text and skip the update if someone is editing at the same moment.

## See also

- [Review a pull request](04-review-a-pr.md)
- [Open a pull request](03-open-a-pr.md)
- [Contributor guide](README.md)
- [Agent-facing contracts](../agents/llms.txt): the repository's index for AI agents
- [Product llms.txt](https://flisk.sh/llms.txt): the public index for demos, bubbles, and skills
