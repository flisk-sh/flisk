# What the Oct 27 Product Hunt launch taught

Flisk (the CLI) launched on Product Hunt on Tue Oct 27, 2026: https://www.producthunt.com/products/flisk (post 1289517). It finished with about 0 points. Each item below says what happened, how we know, and what changes for "Flisk for AI agents" on Wed Oct 28.

Where an item says "observed", it was seen on the day. Where it says "not verified", it is our best reading and should be checked with Product Hunt support before it is repeated.

## 1. The post was not featured

- **What happened:** the post was never featured, so it did not appear on the Product Hunt homepage or on the default daily leaderboard. Most visitors only ever see featured posts.
- **How we know:** observed in the post's page data, which showed `featuredAt: null` all day, and `dailyRank` 151.
- **Why it matters:** Product Hunt says the homepage shows featured products by default. A post that is not featured can only be found through a direct link, a search or a topic page, so it gets almost no organic visitors, whatever the product is.
- **Why it was not featured:** not verified. Product Hunt does not publish its featuring criteria; its launch guide says it keeps the algorithm's details private so they cannot be gamed. Its product guidelines say a launch must be new or a substantive update.
- **What changes:** tonight, the maker asks Product Hunt support (help.producthunt.com, or the in-app support chat) whether the new listing meets the featuring criteria and whether a second listing one day after the first counts as a separate product. If support says it would be treated as a duplicate of the Flisk listing, the launch moves or becomes an update of the existing listing; it does not go out regardless.

## 2. Votes are not points

- **What happened:** at least one upvote added 0 points to the post.
- **How we know:** observed on the day: an upvote was cast and the post's points did not change.
- **Why it matters:** Product Hunt weights each vote by the account behind it. Votes from new accounts, or from people who arrive through a direct link and vote without doing anything else on the site, add little or nothing. Product Hunt does not publish the weights (not verified beyond what we observed).
- **What changes:** we stop counting votes as the measure of the day. The useful numbers are comments with a real question, GitHub issues opened by launch readers, and installs. We do not ask anyone to create an account to vote, because it does not help and it looks like manipulation.

## 3. It launched at 00:01 PT with no warm-up

- **What happened:** the listing went live at 00:01 PT (Product Hunt's day starts then) with nobody told in advance, so the first hours, when a post is most visible on the new list, passed with no visitors who knew it was coming.
- **How we know:** reported by the team on the day: no announcement went out before the post was live. The launch time is on the listing.
- **What changes:** 00:01 PT is still the right time (Product Hunt's own guide says it gives a full 24 hours), but the warm-up happens the evening before: a note in the Flisk Discord and to the people who already use Flisk that the agent launch is tomorrow, with a link to the setup page so they can try it first. The note does not ask for votes.

## 4. No hunter

- **What happened:** the maker posted the listing; no one with a Product Hunt following hunted it.
- **How we know:** observed on the listing.
- **What it means:** probably little. Product Hunt's launch guide says there is no discernible advantage to a third-party hunter, and paying a hunter is forbidden. A hunter's followers do get a notification, which may help a post that is featured.
- **What changes:** if an active Product Hunt member who has really used Flisk offers to hunt it, accept. Do not search for or pay a hunter.

## 5. Comments came without votes

- **What happened:** the post got comments, but the commenters did not upvote, or their upvotes added no points.
- **How we know:** observed on the listing: a comment count above zero next to about zero points.
- **What it means:** people who comment because a maker asked them to comment are the same people whose votes count for little (see item 2). Comments still help the people reading the listing, so they are worth having, but they do not lift a post that is not featured.
- **What changes:** the first comment asks one real question, and the maker answers every comment with something specific. No one is asked to comment for the sake of the count.

## 6. US-morning timing

- **What happened:** the US morning, roughly 06:00 to 10:00 PT, is when most US visitors arrive. The maintainers work on European time (commit timestamps are UTC+1 and UTC+2), so that window is the European afternoon and evening, the end of the working day.
- **How we know:** the time-zone overlap is arithmetic. Whether replies on Oct 27 actually slowed in that window is not verified; check the comment timestamps on the listing.
- **What changes:** the checklist puts one person on comments from 06:00 to 10:00 PT, with a second person covering the European morning (00:01 to 06:00 PT). Each reply within an hour.

## What does not change

- No vote requests, no vote swaps, no new accounts, no company account. These break Product Hunt's rules (see [checklist.md](checklist.md), "What not to do") and they would not have fixed any of the problems above.
- No numbers in posts other than the 19 tools, which is a count of the code, and the wording in [docs/claims.md](../../claims.md).
