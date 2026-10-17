# Coordinated launch plan: Show HN and Reddit (Universe week)

Tracks [#1444](https://github.com/tdk-landscape/tdk-cli-core/issues/1444). Clip scripts are in [clips.md](clips.md). Nothing in this file has been posted. Posting is a human action; this file is the plan and the prepared text.

## Dates

Universe week is Oct 28-29, 2026 (Wed-Thu).

| Day | Channel | Who posts | Notes |
| --- | --- | --- | --- |
| Tue Oct 27 | Dry run | Owner | Read the Show HN text and each Reddit post aloud against the live commands in [clips.md](clips.md). Run `tdk up <stack> --dry-run` on a fresh checkout. |
| Wed Oct 28, ~09:00 PT | Show HN | Owner | Morning US Pacific, a weekday. Post the repo link, not the website. |
| Thu Oct 29, 10:00 PT | r/webdev | Owner | Different angle (see below). |
| Thu Oct 29, 14:00 PT | r/devops | Second maintainer | Different angle. Not the same text as r/webdev. |
| Thu Oct 29, 16:00 PT | r/docker | Second maintainer | Different angle. Not the same text as r/webdev or r/devops. |

Times are a plan, not a rule. Move a Reddit post if its subreddit's rules say a day or time is not allowed.

## Owner rota

One owner runs the launch. A second maintainer covers the Reddit posts and answers in the first 3 hours after each post.

| Role | Person | Covers |
| --- | --- | --- |
| Owner (posts Show HN, answers HN for 3 h, keeps the log) | TBD | HN thread, launch log, go/no-go on Tue dry run |
| Second maintainer (Reddit posts, Reddit replies) | TBD | r/devops and r/docker posts, their replies, new issues |
| Backup (any day, any channel) | TBD | Takes over if the owner is unreachable for more than 1 h during the window |

Replace the TBD names before Tue Oct 27. A slot with no name means the launch does not go out.

## Rules for every post

- Do not ask anyone to upvote, star, comment or share. Do not add a star request to any post or comment.
- One account per person. Do not post from several accounts or ask others to post.
- No cross-posting of the same text on the same day.
- Answer questions in the thread. Do not delete or edit a post after it is up, except to fix a broken link.
- If a question is a real bug or a feature request, open or link a GitHub issue and say so in the reply.
- If a comment is hostile, reply once with facts or leave it. Do not argue past two replies.

## Prior coverage (check before posting)

Found before the launch. Links were supplied by the owner; the HN search turned up nothing for TDK, so the HN history is still unchecked.

| Item | Link | Date | What it claims | Action before Oct 28 |
| --- | --- | --- | --- | --- |
| dev.to article: "We ran 100 microservices on a 16GB laptop" | https://dev.to/mynameis0d3c53a3/we-ran-100-microservices-on-a-16gb-laptop-no-kubernetes-590e | Sep 27 | 10 services healthy in 8 s (161 MiB), 50 in 24 s (829 MiB), 100 in 112 s (1.6 GiB); 0 crashes, 0 OOM; benchmark script and raw JSON in the repo | Check each number against the committed benchmark JSON and `docs/claims.md`. The Show HN draft uses different figures (14 services in 4.6 s; 100 stubs in 472 s on a CI runner). Use one set of numbers, and say which hardware it came from. Link this article from the first comment as the longer write-up. |
| HN submission "New Open Source Tool for Development Experience. TDK CLI – service.json" (not Show HN) | https://news.ycombinator.com/item?id=49924046 | about Oct 2, 2026 (16 days before Oct 18) | 1 point, 1 comment (submitter only); submitted URL is the repo, `github.com/tdk-landscape/tdk-cli-core` | Same repo URL as the planned Show HN. HN flags a resubmitted URL, so the Oct 28 post may be marked a dupe. Options: ask HN (hn@ycombinator.com) before posting, or post a different URL (the quickstart page) with the repo in the first comment. Owner decides on Tue Oct 27. |
| Two earlier Show HN posts | TBD (owner to supply links) | TBD | TBD | Check whether either is still on the front page or drew discussion. If so, the Oct 28 post needs a new angle, or move it. HN flags a resubmission of the same URL. |

## Rules check (must be done on Tue Oct 27)

Status: **not verified**. Reddit was not reachable from the session that wrote this plan (the in-app browser refused reddit.com and WebFetch could not reach old.reddit.com). The owner must open each page below and fill in the table before posting.

| Channel | Page to read | Checked by / date | Self-promotion limit | Title or flair rule | Account age / karma rule | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Show HN | https://news.ycombinator.com/showhn.html | TBD | TBD | TBD | TBD | TBD |
| r/webdev | https://www.reddit.com/r/webdev/about/rules/ | TBD | TBD | TBD | TBD | TBD |
| r/devops | https://www.reddit.com/r/devops/about/rules/ | TBD | TBD | TBD | TBD | TBD |
| r/docker | https://www.reddit.com/r/docker/about/rules/ | TBD | TBD | TBD | TBD | TBD |

If a rule forbids the post as written, change the post to fit the rule or skip that channel. Do not post around a rule. Record the change in the launch log.

## Show HN

**Title** (80 characters maximum, HN rule; the draft in #1444 was too long at about 95):

> Show HN: TDK CLI – one service.json per service, then tdk up

Count: 63 characters.

**URL:** https://github.com/tdk-landscape/tdk-cli-core

**First comment** (post it as the author, right after the submission):

> Hi HN, I maintain TDK CLI. It turns one `service.json` per service into a local Docker and Tilt stack, so `tdk up <stack>` starts the services you pick and nothing else.
>
> What it does: scaffolds services (`tdk resource`), generates the Docker, Compose and Tilt files from `service.json` and `.tdk/project.json`, and checks they still match (`tdk config verify`). `tdk up <stack> --dry-run` prints the services and URLs before any container starts.
>
> What it does not do: it is not a deploy tool (production stays on Helm or whatever you use), and it is not a drop-in Compose replacement for a stack you already maintain. If Compose or your own Tilt file works for you, keep it.
>
> Setup needs Docker and Tilt. Native Windows only supports `tdk` inspection commands; use WSL2 Ubuntu for `tdk up`. The core CLI is MIT and needs no key. Premium features are optional.
>
> The CLI makes no outbound calls of its own except `tdk upgrade`, an optional premium fetch with a license key, and the health ping from `tdk doctor`. Details: docs/security.md (link in the reply if asked).
>
> Happy to answer anything about the design, the generated files, or where it falls short.

Word count: about 180. Keep the first comment as posted; do not add a star or upvote request.

## Reddit posts (three angles, not one text)

### r/webdev: the "one file per service" angle

**Title:** I got tired of hand-writing compose files for every side service, so I wrote a small CLI for local stacks

**Body:**

> I work on TDK CLI, a MIT-licensed tool that keeps each local service described by one `service.json`. `tdk resource` scaffolds a backend or frontend, `tdk up <stack>` starts only that stack through Docker and Tilt, and `tdk config verify` checks that the generated files still match.
>
> Honest limits: it is for local development only. It is not a deploy tool. If you have two services and a working compose file, you do not need this. Repo: https://github.com/tdk-landscape/tdk-cli-core
>
> If you try it and something breaks, the issue tracker is the place to tell me. I will answer what I can in the thread.

### r/devops: the "local parity without a cluster" angle

**Title:** Local dev stack from one service.json per service (Docker + Tilt), with a dry run before anything starts

**Body:**

> For teams that run Helm in production but want a fast local loop: TDK CLI generates a Docker and Tilt stack from one `service.json` per service. `tdk up <stack> --dry-run` shows the services and host ports first.
>
> It does not touch your cluster. It does not replace Helm. The outbound-call list is in docs/security.md, so you can check what it sends.
>
> Repo: https://github.com/tdk-landscape/tdk-cli-core

### r/docker: the "generated files you can read" angle

**Title:** A CLI that generates the Dockerfile, Compose and Tilt files for local services, and checks they have not drifted

**Body:**

> TDK CLI writes the Docker, Compose and Tilt files for local services from one `service.json` per service. You can read them. `tdk config verify` fails if someone edits a generated file by hand, and `tdk config regenerate` puts them back.
>
> Note on the Dockerfile: `tdk up` builds its own generated image, not the scaffolded `Dockerfile` in each service folder. The scaffolded one is a starting point for building outside TDK. If you spot a case where that is confusing, tell me in the issues.
>
> Native Windows is inspect-only; use WSL2 Ubuntu to run it. Repo: https://github.com/tdk-landscape/tdk-cli-core

## Prepared answers

Keep each answer under 80 words. Link, do not paste long docs.

**Why not Docker Compose / Tilt / devcontainers?**

> Compose is fine for two or three services you wrote yourself, and TDK does not replace it there. TDK helps when you want scaffolding, starting one stack out of many (`tdk up <stack>`), and generated Tiltfiles. If Compose or a Tiltfile you maintain works, keep it. Full comparison with known limits: docs/compare-honest.md.

**Is this a deploy tool?**

> No. It runs local services through Docker and Tilt. Production stays on Helm or whatever you use. It is not for Kubernetes deployment.

**What does it send over the network?**

> No telemetry. Outbound calls are `tdk upgrade` (only when you run it), an optional premium fetch that needs a license key, and the health ping from `tdk doctor` to your local services. The full table is in docs/security.md under "What TDK sends over the network", and it is reproducible from `cli/src`. Related question: #563.

**License / premium?**

> The core CLI is MIT and needs no key. Premium is an optional key for extra features. `tdk up` works without a key. Source of the boundary: GOVERNANCE.md, "license boundary and donation scope".

**Windows?**

> Native Windows supports `tdk` inspection commands only. Run the stack from WSL2 Ubuntu. Setup: docs/wsl2.md.

**It is just Tilt with extra steps.**

> Tilt does the watching and live update. TDK writes the Tiltfile and the service files from `service.json`, so you do not hand-write them. If you already keep a Tiltfile you like, stay on it.

**Why another tool when X exists?**

> Fair question. The narrow claim is one `service.json` per service and stack-level start. If another tool already covers your case, use it. We list known limits in docs/compare-honest.md.

**Does it work on my stack (Python, Go, Rust, etc.)?**

> Backend languages in the scaffold are bun (default), python, go, rust, and node, per `tdk resource --help`. For anything else, use `bring-your-own` with a Dockerfile. Check the docs for the exact set before you promise a language.

## Do not

- Do not ask for stars, upvotes or comments.
- Do not say "we are launching" in a way that asks people to act.
- Do not quote benchmark numbers that are not in docs/claims.md. The draft in `docs/drafts/show-hn.md` has numbers; check each against the claims registry before the Tue dry run, or drop them.
- Do not reply to a question with a claim you have not checked in the code. If unsure, say "I will check and reply" and do it.

## Launch log

Copy this template to `docs/marketing/launch-log.md` on the day. Do not commit it before the launch date.

```markdown
# Launch log (#1444)

Owner: <name>   Second maintainer: <name>

| Time (PT) | Channel | Action | Link | Comments at +1 h | Comments at +24 h | New issues by +48 h | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Show HN | Submitted | | | | | |
| | Show HN | First comment posted | | | | | |
| | r/webdev | Posted | | | | | |
| | r/devops | Posted | | | | | |
| | r/docker | Posted | | | | | |

## Rule changes made on the day
- (channel, rule, what changed)

## Questions raised (one line each, link the reply or issue)
- 

## Issues opened by launch readers
- 

## Follow-ups
- 
```

Done when the log is filled in and every question in the first 48 hours has a reply or a linked issue.

Related: #489 (first real teams in ADOPTERS.md), #111 (repo discoverability checklist).
