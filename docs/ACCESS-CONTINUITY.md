# Access continuity

This page says how the project keeps going if one maintainer cannot continue. The goal is that the remaining maintainer can accept changes, close and create issues, and release a new version within a week of learning that someone has lost the ability to act.

## Who holds access today

The people with merge rights are listed in [MAINTAINERS.md](../MAINTAINERS.md). Access to each system is held as follows:

| System | What it is used for | Who can act | How the second maintainer gets access |
| --- | --- | --- | --- |
| GitHub repository `tdk-landscape/tdk-cli-core` | Code, issues, pull requests, releases | Maintainers with admin or merge rights | Added as a repository admin by an existing admin |
| npm package `@tdk-landscape/tdk-cli-core` | Publishing the CLI | Maintainers listed as npm owners | Added as an npm package owner by an existing owner |
| `NPM_TOKEN` repository secret | Automated publish from the release workflow (`release-binaries.yml`, `publish-tdk-import.yml`) | Repository admins | Admins can read and rotate the token in repository settings |
| Release signing | Sigstore keyless signing in the release workflow | No private key; the workflow identity signs | Nothing to hand over: any maintainer who can run the release workflow can produce a signed release |
| Security advisories | Private vulnerability reports | Repository admins and maintainers with security access | Added as a security manager by an existing admin |

## What must be true before this page is relied on

These items are part of this plan. They have to be checked by a maintainer, because they cannot be verified from the repository alone:

- [ ] Every maintainer in `MAINTAINERS.md` is a GitHub repository admin.
- [ ] Every maintainer in `MAINTAINERS.md` is an owner of the npm package.
- [ ] A backup owner of the GitHub organization is named, with a recovery method stored outside any one person's machine.
- [ ] The npm account for the package has two-factor authentication, and recovery codes are stored somewhere a second maintainer can reach.

## If a maintainer is unavailable

1. Any remaining maintainer confirms the loss of access and records the date in a GitHub issue.
2. The remaining maintainer uses their admin rights to accept pull requests and close or open issues. No other access is needed for this.
3. To release, the remaining maintainer runs the release workflow. That works with the existing `NPM_TOKEN` and does not need the missing person's account.
4. If the missing person's npm or GitHub access is also needed, an admin adds a new owner. Recovery of the organization account follows the steps in the checklist above.

Work that cannot be completed within a week is recorded in an issue so that other maintainers can pick it up.
