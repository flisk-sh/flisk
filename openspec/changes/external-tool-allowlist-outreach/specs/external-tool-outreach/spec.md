# external-tool-outreach Specification

## Purpose

Define how Flisk asks public projects to evaluate Flisk CLI for a tool catalog, recommended-tools list, or published allowlist, without claiming endorsement or contacting private policy systems.

## ADDED Requirements

### Requirement: Outreach states evaluation, not endorsement

The outreach packet SHALL ask the target project to evaluate Flisk CLI. It MUST NOT say that Flisk CLI is already verified, approved, recommended, or allowlisted by that project or by any company that has not published that status.

#### Scenario: Draft claims a status the target has not granted
- **WHEN** a draft issue says Flisk CLI is a verified or recommended tool of the target project
- **THEN** review rejects the draft until the claim is removed or replaced with a link to the target's own published statement

#### Scenario: Target later publishes acceptance
- **WHEN** the target project merges a list entry or closes the issue as accepted
- **THEN** the outreach record MAY quote that statement and MUST link to the merged change

### Requirement: Target must already publish a relevant list

An issue SHALL be opened only in a public repository that already documents external tools, recommended CLIs, an allowlist, a denylist, or a developer-setup catalog, and whose contributing guide allows issues or pull requests of that kind.

#### Scenario: Repo has no tool catalog
- **WHEN** the target repository does not publish a tool list, baseline, or setup doc
- **THEN** no issue is opened

#### Scenario: Private company policy
- **WHEN** the only known allowlist or denylist is internal to a company
- **THEN** no issue is opened against that company's private repos, and no employee is asked to leak internal policy

### Requirement: Affiliation is disclosed

Every issue and pull request SHALL state that the author maintains Flisk CLI, link the canonical repo `flisk-sh/flisk`, and name the license (MIT for core).

#### Scenario: Issue opened without disclosure
- **WHEN** a draft does not identify the author as a Flisk maintainer
- **THEN** the draft is not sent

### Requirement: Packet contains only checkable facts

The outreach packet SHALL include install options, checksum verification, runtime dependencies (Docker, Tilt), supported platforms, and the boundary that Flisk CLI is local development orchestration rather than a production deploy tool. It MUST NOT claim a security audit, SOC2 report, or "no network calls" unless a documented command demonstrates that claim.

#### Scenario: Reviewer asks how to verify the binary
- **WHEN** the packet is rendered
- **THEN** it links the release assets and `checksums.txt` in `flisk-sh/releases` and the install script that checks those checksums

#### Scenario: Unsupported security claim
- **WHEN** a draft says Flisk CLI is certified or audited and no public report is linked
- **THEN** review removes the claim

### Requirement: One request per target, rate-limited

The project SHALL keep one open request per target repository. A new request to the same repository MUST NOT be opened while an earlier issue is open, or within 90 days of a decline, unless the maintainer asked for an update.

#### Scenario: Duplicate issue
- **WHEN** an outreach record for that repository is `open` or `declined` within 90 days
- **THEN** a second issue is not opened

### Requirement: Decline and silence stop the thread

The sender MUST NOT argue after a decline. If the issue has no maintainer reply after 30 days, the record SHALL be marked `no-response` and MUST NOT be bumped more than once.

#### Scenario: Maintainer declines
- **WHEN** a maintainer closes the issue as not accepted
- **THEN** the record is `declined`, no follow-up issue is opened, and the reason is stored

### Requirement: Status is tracked

Each request SHALL be stored with target URL, rationale, issue or pull-request URL, sent date, and status `draft`, `open`, `accepted`, `declined`, or `no-response`.

#### Scenario: Issue is filed
- **WHEN** a human opens the issue
- **THEN** the record moves from `draft` to `open` and stores the issue URL
