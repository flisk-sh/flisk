# Contributor badges

Every contributor whose pull request is merged into Flisk gets a personal `FLISK HALL OF FAME` badge. You can copy it and paste it into your portfolio, README, or anywhere you show your open-source contributions.

## Where your badge lives

After a maintainer merges your PR, the [Hall of fame workflow](https://github.com/flisk-sh/flisk/actions/workflows/hall-of-fame.yml) rebuilds the [Hall of fame: community contributors](https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3Acommunity) issue. Your row includes:

- A `FLISK HALL OF FAME @<your-login> • <N> merged PRs` badge image
- A copy-ready markdown snippet under **Copy your badge**

## Copy your badge

Open the Hall of Fame issue, find your row, and copy the snippet in the **Copy your badge** section. It looks like this:

```markdown
[![FLISK HALL OF FAME @your-login • N merged PRs](https://img.shields.io/badge/FLISK%20HALL%20OF%20FAME-%40your-login%20%E2%80%A2%20N%20merged%20PRs-06b6d4?style=for-the-badge&labelColor=07080f)](https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3Acommunity)
```

Paste it into your portfolio README, GitHub profile README, personal site, or anywhere markdown images render. The badge links back to the open Hall of Fame issue so anyone can verify your contribution.

## Founding Contributor badge

The first 100 people to ship code to any `flisk-sh` repository earn a permanent, numbered **Founding Contributor** badge to show on their GitHub profile or CV. After that, the badge is a numbered **Flisk Contributor** badge.

To claim yours, post the link to a merged PR in `#start-here` on the [Flisk Discord](https://discord.gg/qMu5Xn8Kaq). Within a few minutes a bot replies with:

- Your number, given in the order people claim them
- Your badge and ready-to-paste markdown
- The matching Discord role, and access to the private `#contributors` channel with the maintainers

Each person gets one badge. Claimed seats are listed in the [Founding Contributors](https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3Acommunity+%22Founding+Contributors%22) issue.

## Tiers and belts

Once you hold a numbered badge, you also level up. Within about an hour of a merge, a bot updates your Discord roles and announces any new level in `#contributors`, with badge markdown to paste into your GitHub profile. You hold one tier and one belt, always the highest you have earned, and a level never goes down.

Your **tier** comes from your merged PRs across every `flisk-sh` repository:

| Tier | Merged PRs |
| --- | ---: |
| Flisk Regular | 5 |
| Flisk Core | 15 |
| Flisk Veteran | 30 |
| Flisk Elite | 50 |
| Flisk Legend | 100 |

Your **belt** comes from the hardest `rank:` label on the issues your PRs fixed:

| Belt | Issue rank |
| --- | --- |
| White Belt | 8 to 7 kyu |
| Green Belt | 6 to 5 kyu |
| Brown Belt | 4 to 1 kyu |
| Black Belt | dan |

Reaching 15 merged PRs also tells the maintainers you are a candidate for the maintainer path, starting with helping to review other contributors' PRs.

## How badges are awarded

- Badges are generated automatically on every merged community PR; you do not need to request one.
- The label shows your GitHub login and your total merged PR count in Flisk at the time the issue last refreshed.
- Maintainer and bot PRs do not receive badges.
- Ranks come from the `rank:` label on the issues your PRs fixed (8 kyu easiest up to 1 dan hardest). Your highest rank appears in the Hall of Fame table.

## GLOBAL badge

The project also publishes an aggregate `FLISK HALL OF FAME GLOBAL` badge showing the overall contributor count. It appears in the root README and refreshes on every merge.

## Want to be on the list?

Start with a [good first issue](https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Your first merged PR earns your first badge.
