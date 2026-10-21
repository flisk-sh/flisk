# Support

What you can expect from the maintainers of Flisk. Numbers were measured from the GitHub repository on 2026-10-05, not promised.

## Where to ask

| You need | Go to |
| --- | --- |
| A question about adopting Flisk | [Adoption question](https://github.com/flisk-sh/flisk/issues/new?template=adoption-question.yml) or [Discussions](https://github.com/flisk-sh/flisk/discussions) |
| A bug | [Bug report](https://github.com/flisk-sh/flisk/issues/new?template=bug_report.yml) |
| A feature | [Feature request](https://github.com/flisk-sh/flisk/issues/new?template=feature_request.yml) |
| A premium key | [Premium license request](https://github.com/flisk-sh/flisk/issues/new?template=premium_license.yml) or the [website form](https://flisk.sh/#waitlist) |
| A security problem | [SECURITY.md](SECURITY.md), privately; never a public issue |

There is no paid support contract, chat channel or phone line.

## Response time

The stated aim is a reply within one working day. What the history shows:

- **Issues:** nobody outside the maintainers has opened one yet, so there is no measured response time for issues.
- **Pull requests from outside contributors:** 16 were measured on 2026-10-05, all merged. The first maintainer response came between about 6 minutes and about 8 hours later for the 14 that got one (the other two were merged within 11 and 3 minutes without a comment). They were all opened within four days (2 to 5 October 2026), so this is a short window, not a track record. A later count of non-maintainer, non-bot authors in `gh pr list` found 18 (17 merged, 1 open); response times were not re-measured for the extra ones.

## Roadmap

There is no separate roadmap document. The plan is the open issues: [start here](https://github.com/flisk-sh/flisk/issues/469) links the island trackers, and each tracker lists its issues. Release notes are in the [CHANGELOG](CHANGELOG.md).

## Releases and supported versions

Fixes go into the latest release only. In the last 90 days the repository had 688 commits and the npm package had 82 published versions when this page was written (a later count on `origin/main` gave 699 commits and `npm view` listed 83 versions), with up to seven in one day (4 to 5 October 2026). Pin the version you tested: see [upgrading](docs/upgrading.md).

## Who maintains it

Two maintainers from two companies ([MAINTAINERS.md](MAINTAINERS.md)). In the last 90 days one of them authored about 59% of the commits and the other about 27% (re-counted by author name on `origin/main`: about 57% and 27%). The GitHub repository itself was created on 2026-09-19 and has a small number of stars. If either maintainer stops, you are on one maintainer; the project says it is below the three it needs for a foundation application.

If the project goes quiet, core is MIT and you can fork it. A written exit path from your own repositories is still open ([#505](https://github.com/flisk-sh/flisk/issues/505)).

## Licence and premium

- **Core** (the CLI, engine and generators in this repository) is MIT. `flisk up`, scaffolding, Traefik, Postgres and Tilt live update need no key, including on commercial and client projects. See the [licence matrix](docs/FEATURES.md#license-matrix).
- **Premium** adds Verdaccio, DDD scaffolding and Sablier idle stop, plus downloaded implementations of Playwright, C4 and similar extras. In this repository those are disabled stubs; with `TDK_LICENSE_KEY` the CLI downloads the implementation and caches it for 12 hours, after which an expired or revoked key stops unlocking it. That download is one of the few network calls Flisk makes: see [security](docs/security.md).
- **Not published anywhere in the repository:** the price, the licence terms for the premium code, and any service level. A premium key is a feature key, not an SLA. Ask in the premium request before you depend on it, and check the terms against your client contracts yourself; this is not legal advice.
