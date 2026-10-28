# Launch checklist: Flisk for AI agents (Tue Oct 27 evening to Wed Oct 28, 2026)

All times are Pacific (PT). Europe is 8 hours ahead on these dates (CET, UTC+1, since Oct 25; the US moves to PST only on Nov 1, so PT is UTC-7 until then). 00:01 PT on Wed Oct 28 is 08:01 CET.

> **The maker does every Product Hunt action by hand, from their own personal account:** submitting and scheduling the listing, posting the first comment, replying, and posting on X, LinkedIn and Discord. No agent, script or bot submits, posts, comments or votes, and no one votes from a second account. This file is a plan, not an automation.

The copy for every step is in [README.md](README.md). Why each step is here is in [lessons-learned.md](lessons-learned.md).

## Tonight (Tue Oct 27)

| By (PT) | Who | Step | Done |
| --- | --- | --- | --- |
| 14:00 | Maker | Check the connect command on a clean machine: `npm install -g @flisk-sh/flisk`, then `flisk connect claude --dry-run` and `flisk connect claude`. The first comment and card 2 already use it (shipped in 1.4.9); if it fails there, drop that line from the first comment and tell the maintainers. | [ ] |
| 14:00 | Maker | Ask Product Hunt support (help.producthunt.com, or the support chat on the site) two questions: does a separate "Flisk for AI agents" listing, one day after the Flisk listing, meet their guidelines for a new product, and is there anything that would keep it from being featured? Record the answer and its time in the launch log. | [ ] |
| 15:00 | Maker | Run the whole flow once on a clean folder: install, run `flisk connect claude`, ask the agent to build and start the two-service shop, check `status`. If it fails, fix or cut the claim before it goes on the listing. | [ ] |
| 16:00 | Maker | Record the video (README, "Video"). Upload it to YouTube as unlisted (Product Hunt takes a YouTube link). | [ ] |
| 17:00 | Maker | Fill in the listing in Product Hunt's launch flow: name, tagline 1, description, three launch tags, links, thumbnail, the five gallery PNG files in order with their alt text, the video, makers. Paste the first comment. | [ ] |
| 17:30 | Maker | **Schedule** the listing for Wed Oct 28, 00:01 PT (Product Hunt lets you schedule up to a month ahead). Open the scheduled listing's preview once and check every image, link and line. Do not use "Launch now". | [ ] |
| 18:00 | Maker | If an active Product Hunt member who has really used Flisk offers to hunt it, accept and add them before the post goes live. Do not look for or pay a hunter: Product Hunt says a third-party hunter gives no discernible advantage, and paying anyone to hunt is forbidden. | [ ] |
| 18:00 | Maker | Warm-up, without asking for votes: one message in the Flisk Discord and one post on X saying the agent launch is tomorrow, with the setup page link so people can try it tonight. | [ ] |
| 18:00 | Maker | Send the personal note to Lekast, MakeOffer, mfin.services and Red Moon Digital (README, "Note to the four adopter teams"), one message per team. | [ ] |
| 20:00 | Maker | Agree the comment rota: who answers 00:01 to 06:00 PT (European morning) and who answers 06:00 to 10:00 PT (US morning). Copy the launch log template from [docs/marketing/launch-plan.md](../../marketing/launch-plan.md) for the day. | [ ] |

## Launch: Wed Oct 28, 00:01 PT (08:01 CET)

| Time (PT) | Who | Step | Done |
| --- | --- | --- | --- |
| 00:01 | Maker | Open the listing and check it is live, the gallery shows, and the first comment is under it. If the first comment is missing, post it now. | [ ] |
| 00:05 | Maker | Check the post's page data for `featuredAt`. Record it in the log. If it stays `null`, see "If the listing is not featured" below. | [ ] |
| 00:10 | Maker | Post the X post and the Discord message (README, "Posts for other channels") with the listing link. | [ ] |

## First 4 hours (00:01 to 04:00 PT)

- [ ] Answer every comment within an hour, with something specific: a command, a doc link, or "I will check and reply" followed by the check.
- [ ] A bug report in a comment becomes a GitHub issue; link it in the reply.
- [ ] Do not edit the tagline, description or gallery once live, except to fix a broken link or a wrong fact.
- [ ] Every hour, log: comments, questions answered, issues opened. Do not log votes as the measure; see lessons-learned, item 2.

## US morning (06:00 to 10:00 PT)

- [ ] The US-morning person is on comments for the whole window.
- [ ] 07:00: post the LinkedIn post.
- [ ] Answer questions about Compose, Tilt and devcontainers with the prepared answers in [docs/marketing/launch-plan.md](../../marketing/launch-plan.md), "Prepared answers".
- [ ] If someone tries it and it fails, ask for the `flisk doctor --json` output and help in the thread.

## Afternoon (10:00 to 16:00 PT)

- [ ] Keep answering within an hour.
- [ ] Share one thing learned from a real comment (a fix, a doc change) on X as a reply in the launch thread, if there is one. Do not repeat the launch post.
- [ ] Re-check `featuredAt` and record it.

## Last 2 hours (22:00 to 23:59 PT)

- [ ] Answer every open comment.
- [ ] Do not post a "last hours, please support" message anywhere. It is a vote request in other words.
- [ ] 23:59: close the log. Record comments, questions, issues opened, installs if known, and the support answer from last night.
- [ ] Next day: one short thank-you comment on the listing that names what changed because of the feedback (with links). No numbers that are not in the log.

## If the listing is not featured

- Do not ask more people to vote; it would not help (votes from people who come only to vote count for little) and it can get the post removed.
- Ask Product Hunt support once, politely, whether anything is missing. Then spend the day on the people who are trying it: answers, fixes, issues.
- The kit still has value without the homepage: the setup page, the video and the gallery work on the Flisk Discord, X and in replies.

## What not to do, and why it backfires

| Do not | Why it breaks the rules | Why it backfires even if no one notices |
| --- | --- | --- |
| Ask people to upvote, directly or in other words ("support us", "we need your vote") | Product Hunt's launch guide: the one rule is that you cannot ask people directly to upvote. Ask them to visit and comment instead. | Votes from people who come only to vote add little or nothing to the points (we saw an upvote count 0 points on Oct 27). |
| Vote swaps ("I upvote yours, you upvote mine"), launch groups, upvote pods | Product Hunt removes products whose makers spam their audiences or pay for upvotes, and can ban accounts permanently; trading votes is the same manipulation. | Swapped votes come from accounts that never use the product, which is the pattern Product Hunt discounts. |
| New accounts, second accounts, or asking friends to sign up to vote | Accounts created to vote are spam under Product Hunt's community guidelines. | New accounts carry little or no weight, so the vote does nothing, and a burst of them is easy to detect. |
| A company or brand account posting or commenting | Product Hunt does not allow company accounts to post products or comment. | The post or comment can be removed. |
| Paying a hunter, a "launch service", or for traffic | Forbidden; Product Hunt says it will take action to remove the product. | You lose the listing and the launch. |
| Asking someone to upvote before they have tried it | It is a vote request. | Their comment, if any, cannot say anything true about the product, and readers notice. |
| An agent or script that posts, comments or votes | Automated activity is spam. | It also takes the honest part of the launch, the maker answering, away. |
