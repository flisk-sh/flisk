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

## How badges are awarded

- Badges are generated automatically on every merged community PR; you do not need to request one.
- The label shows your GitHub login and your total merged PR count in Flisk at the time the issue last refreshed.
- Maintainer and bot PRs do not receive badges.
- Ranks come from the `rank:` label on the issues your PRs fixed (8 kyu easiest up to 1 dan hardest). Your highest rank appears in the Hall of Fame table.

## GLOBAL badge

The project also publishes an aggregate `FLISK HALL OF FAME GLOBAL` badge showing the overall contributor count. It appears in the root README and refreshes on every merge.

## Want to be on the list?

Start with a [good first issue](https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Your first merged PR earns your first badge.
