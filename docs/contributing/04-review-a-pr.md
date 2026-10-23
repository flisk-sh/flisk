# 4. Review a pull request

Anyone can review a pull request. Every review follows the same rules:

1. Use an AI review button for the first pass.
2. Check every point the AI makes against the diff yourself.
3. Submit your own review on GitHub and say what you checked.

You are responsible for the review you submit, not the AI.

## Before your first review: required reading

Read these before you review. They take about an hour in total, and you only do it once. Without them you cannot tell whether the AI's comments are right.

**What Flisk is**

- [ ] [README](../../README.md): what Flisk does and the commands people use.
- [ ] [Project overview](../project-overview.md): the Project → Stack → Resource model.
- [ ] [Scope](../scope.md): what Flisk is for, and what it is not for.
- [ ] [Generated files](../generated-files.md): which files Flisk writes. Never edit generated files by hand; change the input that produces them.

**How we work**

- [ ] [Contributing](../../CONTRIBUTING.md): labels, issue claims, and DCO sign-off.
- [ ] [1. Get ready to make a change](01-first-change.md): when a change needs an OpenSpec proposal.
- [ ] [2. Recipes for each kind of change](02-feature-recipes.md): where code lives and which checks each change needs.
- [ ] [3. Open a pull request](03-open-a-pr.md): what a good PR has, including before-and-after evidence.

**Rules everyone follows**

- [ ] [Code of Conduct](../../CODE_OF_CONDUCT.md): how we talk to each other in reviews.
- [ ] [Security policy](../../SECURITY.md): report security problems privately, never in a PR comment.
- [ ] [Governance](../../GOVERNANCE.md) and [Maintainers](../../MAINTAINERS.md): who decides and who merges.

Then try it once: run the [quick setup](../../CONTRIBUTING.md#quick-setup) so you can check out a PR and run its checks yourself.

## The short version

1. Open the PR on GitHub and scroll to the end of its description.
2. Click **Grok**, **Claude**, or **Codex** under **Review this PR in**.
3. Read the AI's answer. Check each point against the diff yourself.
4. On the PR, click **Files changed**, then **Review changes** (top right; on some layouts **Submit review**).
5. Write your comment, choose **Comment**, **Approve**, or **Request changes**, and click **Submit review**.

## The AI is your helper, not the reviewer

The AI buttons open a chat with an AI assistant. That assistant is yours: it answers you, in your own account, and the chat is not shared with the PR author or other reviewers. It does not post anything on GitHub, approve anything, or change any code.

You are the reviewer. The review that counts is the one you submit on GitHub under your name. So:

- **Check before you copy.** The AI can be wrong. It can invent a problem that is not in the diff, or miss a real one. Open the file and line it names and confirm it yourself.
- **Write in your own words.** Paste only the points you checked and agree with. Delete the rest.
- **Say what you did not check.** "I read the code but did not run it" is a useful review.
- **Never paste secrets into the chat.** Tokens, passwords, and private URLs do not belong in an AI chat or in a PR comment.

## How the AI review buttons work

When someone opens, reopens, or edits a PR, the [AI review buttons workflow](../../.github/workflows/ai-review-buttons.yml) adds this section to the end of the PR description:

> **Review this PR in**
> \[Grok\] \[Claude\] \[Codex\]
>
> Shared by [@flisk-sh](https://github.com/flisk-sh) · [flisk](https://github.com/flisk-sh/flisk) · If this helps, please ⭐ [star flisk](https://github.com/flisk-sh/flisk)

Each button is a plain link. It opens the AI's website in a new tab with this message already typed:

```text
Review this pull request. Read the title and diff at https://github.com/flisk-sh/flisk/pull/123.
```

| Button | Opens |
|---|---|
| **Grok** | grok.com |
| **Claude** | claude.ai |
| **Codex** | chatgpt.com |

Pick whichever you already use. They all get the same message. If the buttons help, use the footer link to star the repository. Each site may ask you to sign in; if the chat opens empty after that, click the button again. If you are not signed in, copy the message above, put the PR's link in it, and paste it into any AI chat.

Things to know:

- **Nothing runs in CI.** The workflow only writes the links into the description. No AI is called until you click.
- **Your text is safe.** The section goes after the author's text and never changes it. If the author is editing the description at the same moment, the workflow skips the update instead of overwriting their edit.
- **Buttons missing?** Edit the PR description and save it (any small change works), and the workflow adds them. Maintainers can also run the workflow by hand from the **Actions** tab to add buttons to every open PR.

### Ask better follow-up questions

The first answer is a summary. Ask follow-ups to get a more useful review:

- "Which change could break existing users? Show me the file and line."
- "Is anything in this diff missing a test?"
- "Does the PR description match what the code actually does?"
- "Explain `cli/src/commands/up.ts` lines 40–60 like I am new to the project."
- "Write a short, friendly review comment for the problems you are sure about."

### Merge conflict buttons

If a PR conflicts with `main`, the [AI conflict buttons workflow](../../.github/workflows/ai-conflict-buttons.yml) posts one comment on the PR with **Resolve conflict** buttons for Grok, Claude, and Codex. These give the AI step-by-step instructions to merge `main` into the branch and push the fix. If the AI cannot push to that branch (for example, a fork you do not own), the instructions tell it to push a `fix/<PR number>-conflict` branch instead and open a replacement PR. If the original PR says `Fixes #N`, the replacement says it too. Check the result like any other change, and comment on the original PR with a link to the replacement. When the conflict is gone, the same comment changes to say so and the buttons disappear.

## What to look at

You do not have to check everything. Pick what you can, and say what you covered.

- [ ] **Does it do what the description says?** Compare the title and "What changed" with the diff.
- [ ] **Is it one focused change?** Unrelated edits should be a separate PR.
- [ ] **Is there proof?** For a fix or behavior change, the PR should show real before-and-after output (see [Show what changed](03-open-a-pr.md#show-what-changed)).
- [ ] **Are the checks green?** Look at the checks at the bottom of the **Conversation** tab. A red check needs fixing or an explanation.
- [ ] **Are docs updated?** A new option or changed command needs its docs changed too.
- [ ] **Is anything risky?** Secrets, deleted files, changed defaults, or a new dependency deserve a question.
- [ ] **Can you understand it?** If you, as a newcomer, cannot follow the code, say so. That is useful feedback too.

## Leave comments on lines

1. Open the **Files changed** tab.
2. Hover over a line and click the blue **+** that appears. Drag to select several lines.
3. Type your comment.
4. Click **Start a review** (or **Add review comment** if you already started). This keeps your comments as a draft until you submit, so the author gets one notification instead of many.

**Add single comment** posts right away instead. Use it for a quick question, not for a full review.

To suggest an exact fix, click the **±** icon (**Insert a suggestion**) in the comment box and edit the code inside the block. The author can apply it with one click.

## Submit your review

Click **Review changes** at the top right of **Files changed**, write a summary, and pick one of three options.

### Comment: feedback without a decision

Use **Comment** when you have questions or small notes, or when you only checked part of the PR.

```markdown
Read the CLI changes; did not run them.

Question: what happens when `--port` is 0? The help text does not say.
```

### Approve: "this is ready", with notes

Use **Approve** when you checked the PR and it is good to merge. You can approve and still leave small comments. Mark them clearly as optional so the author knows they do not block the merge.

```markdown
Looks good. I ran `bun run test` on this branch and tried `flisk up --dry-run` in the restaurant example: the new URLs show up as described.

Optional (nit): `parsePort` could use a test for an empty string. Fine to do in a follow-up.
```

### Request changes: "not yet", with reasons

Use **Request changes** when something must be fixed before merge. This is how you reject a PR on GitHub: it does not close the PR, it tells the author what to fix. Always say what is wrong, where, and what would make it OK.

```markdown
Thanks for this! Two things need fixing before merge:

1. `cli/src/commands/up.ts` line 52: the new flag is read but never passed to the generator, so `--no-cache` has no effect. Could you pass it through and add a test?
2. The README still shows the old flag name `--nocache`.

Everything else looks good. Happy to re-review once these are in.
```

When the author pushes a fix, open **Files changed** again, check the new commits, and submit a new review. Choose **Approve** if the problems are fixed. Your old "changes requested" stays on the PR until you submit a new review.

### Closing a PR

Requesting changes is not the same as closing. Only maintainers close PRs, usually when the change will not be accepted or the author stopped responding. If you think a PR should be closed, say why in a **Comment** and let a maintainer decide.

## Write kind, clear comments

- Say what is good, not only what is wrong.
- Be specific: name the file and line, and explain why.
- Ask instead of order: "Could this be…?" works better than "Change this."
- Label small things as `nit:` or `optional:` so the author knows they do not block the merge.
- Review the code, not the person.

Follow the [Code of Conduct](../../CODE_OF_CONDUCT.md) in every comment.

## From the terminal (optional)

With the [GitHub CLI](https://cli.github.com) you can do the same from your terminal:

```bash
gh pr checkout 123
```

```bash
gh pr review 123 --comment --body "Read the CLI changes; did not run them."
```

```bash
gh pr review 123 --approve --body "Ran bun run test on this branch; looks good."
```

```bash
gh pr review 123 --request-changes --body "The new flag is never passed to the generator (up.ts line 52)."
```

## Who can approve and merge

- Anyone can comment, approve, or request changes. Every review helps maintainers decide faster.
- You cannot approve your own PR.
- Only [maintainers](../../MAINTAINERS.md) merge. Before merging, they check the reviews and that the required checks pass.
