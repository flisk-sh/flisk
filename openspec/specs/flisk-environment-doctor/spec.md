## ADDED Requirements

### Requirement: Doctor checks and ranks environment blockers
`flisk doctor` SHALL check whether Docker is running, whether Docker uses Linux containers, whether Tilt meets the documented minimum version, and whether Bun meets the documented minimum when the stack requires Bun. It SHALL check whether ports 80, 443, and 5432 are bound, identify WSL projects under `/mnt/c`, and identify unsupported native Windows execution. It SHALL order remediation guidance before status summaries and SHALL exit 1 if any required check fails. Port conflicts SHALL appear before lower-priority failures in the first failure block.

#### Scenario: Required database port is already bound
- **WHEN** port 5432 is bound while doctor reports other environment results
- **THEN** the first failure block identifies port 5432, gives a fix, and doctor exits 1

#### Scenario: Required tool is missing or too old
- **WHEN** Tilt is missing or below its documented floor, or required Bun is missing or below its floor
- **THEN** doctor reports the requirement and an actionable fix, and exits 1

#### Scenario: Docker cannot run the landscape
- **WHEN** the daemon is down or Docker is using Windows containers
- **THEN** doctor reports the corresponding fix before status summaries and exits 1

### Requirement: Doctor ignores another project's Tilt resources
The `Tilt Resources` check SHALL use the same Tilt-port ownership detection as `flisk status`. When the Tilt on the port this project would use belongs to another project, doctor SHALL NOT query or print that Tilt's resources. It SHALL report the check as skipped and non-blocking, naming the foreign project and the port, and SHALL offer `TILT_PORT` guidance only for that port. When the Tilt belongs to this project, the check SHALL inspect its resources as before.

#### Scenario: Another project's Tilt owns the Tilt UI port
- **WHEN** the Tilt on this project's Tilt UI port is owned by a different project
- **THEN** doctor skips the `Tilt Resources` check without reading that Tilt's resources, names the other project and port, and does not fail readiness

#### Scenario: This project's Tilt owns the Tilt UI port
- **WHEN** the Tilt on this project's Tilt UI port is owned by this project
- **THEN** doctor checks its resources and still fails on failed or stale disabled resources

### Requirement: WSL project placement is diagnosed
When running in WSL2 Ubuntu, doctor SHALL warn if the project is under `/mnt/c` because hot reload may be impaired. With `--strict`, that placement SHALL fail the check and cause exit 1.

#### Scenario: Project is under the Windows-mounted filesystem
- **WHEN** doctor detects the current WSL project under `/mnt/c`
- **THEN** default mode warns that hot reload may be impaired, while `--strict` reports a failure and exits 1

### Requirement: Native Windows landscape startup is unsupported
On native Windows, `flisk doctor` SHALL exit non-zero and instruct the user to use WSL2 Ubuntu with Docker Desktop integration, linking to `docs/wsl2.md`.

#### Scenario: Doctor runs in native Windows
- **WHEN** `flisk doctor` detects a native Windows host
- **THEN** it exits non-zero and prints the WSL2 Ubuntu + Docker Desktop integration instruction and `docs/wsl2.md` link
