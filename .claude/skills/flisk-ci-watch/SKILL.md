---
name: flisk-ci-watch
description: Make the session that opened a pull request responsible for its CI. Find the failing checks with gh, fix them in the PR's worktree, push, and set up the failedci2claude Stop hook so the session is told when CI fails. Use when a PR of yours has a red check, when the user asks to watch or fix CI, or to be told about failing CI.
license: MIT
compatibility: Requires the gh CLI authenticated for flisk-sh/flisk and git. The optional hook needs python3 and changes ~/.claude/settings.json.
metadata:
  author: flisk-sh
  version: "1.0"
---

# Flisk CI watch

The session that opened a pull request owns its CI. A skill only runs when it is called, so it cannot notice a failure by itself: use the steps below when you know CI is red, and the hook (last section) so the session is told.

## Fix a red check

1. See what failed, on the PR's own head:
   `gh pr checks <number> --repo flisk-sh/flisk` then `gh run view --job <job-id> --log-failed`.
   Logs are not available while the run is still in progress; wait, or read one finished job with `gh api repos/flisk-sh/flisk/actions/jobs/<job-id>/logs`.
2. Compare the head the failure names with your own `git rev-parse HEAD`. A failure from a head you already replaced is stale: re-check, do not "fix" it.
3. Decide whose failure it is before editing:
   - Does `main` fail the same check? Run the failing script on `origin/main` in a clean worktree. If yes, the fix belongs in its own PR against `main`, not in this one.
   - A `Server Error` from the GitHub API, or a registry 5xx, is transient: `gh run rerun <run-id> --failed`, no code change.
   - `GEL guards` / `tests-with-change` means a product file changed with no test file: add a test, do not exempt the file.
4. Fix it in the worktree of that PR's branch, not in a shared checkout whose branch other sessions may switch.
5. Run the checks for the files you touched, commit with `git commit -s`, and push to the PR branch. Merge `main` into the branch when it conflicts; never rebase or force-push.
6. Before `git commit --amend`, run `git status`: after a merge that did nothing, an amend rewrites the previous commit and the push is rejected.

## Be told when CI fails

- **Desktop app Auto-fix** wakes an idle session on CI failures, merge conflicts and review comments. Turn it on per pull request. This is the one that works while you are away.
- **The failedci2claude Stop hook** (https://backtogreen.flisk.si) tells the session when a turn ends and one of your open PRs has a failed check. It runs when a turn ends, so it cannot wake an idle session. It reads your PRs with one `gh pr list` call and reports each failure once.

Install it only after the user agrees, because it edits `~/.claude/settings.json`:

```sh
git clone https://github.com/flisk-sh/failedci2claude && cd failedci2claude && ./install.sh
```

Hooks load when a session starts, so open a new session afterwards. To check that it ran, read `~/.claude/hooks/failedci2claude.log`: no line means it never ran; a line naming `gh` means `gh` is missing or not signed in.
