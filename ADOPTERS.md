# Adopters

Teams that run `tdk up` on their own repositories. There are two ways to be listed:

- **Fill in the form.** Open the [We use TDK](https://github.com/flisk-sh/tdk-cli-core/issues/new?template=we-use-tdk.yml) issue form. A maintainer turns it into a row for you, so you do not have to edit a Markdown table.
- **Open a pull request.** Add one row to the table at the bottom of this file.

Each row needs the organization, a link to their repository or a public write-up, and the TDK version. The 100-service `/health` fixture (`tdk-erp-system`, `benchmarks/results`) is a benchmark, not an adopter, and must not be listed here.

## What counts

**A good link** is public and shows that the team runs TDK on its own code:

- a public repository that has a `service.json` and starts with `tdk up`
- a blog post, talk, or case study that describes the setup

**The version** is the output of `tdk --version`, for example `1.3.86`. Use the version you actually run, not the latest release.

**What does not count:**

- benchmark fixtures, including `tdk-erp-system` and anything under `benchmarks/results`
- "evaluating" or "planning to try" TDK
- forks or copies of the projects in `examples/`

**Private teams** can list the organization with a public write-up as the link. A team can be listed without a repository link only if a maintainer can verify that it uses TDK.

By asking to be listed, you confirm that your organization allows it. A maintainer may ask for more evidence before adding a row.

## GitHub dependency graph visibility

If your public repository genuinely installs or invokes `@tdk-landscape/tdk-cli-core` as a project tool, declare it in that repository's `package.json` (usually `devDependencies`) and commit the lockfile used by the project. GitHub builds its dependency graph from supported manifests and lockfiles, then lists public repositories as dependents. The dependency graph does not infer a repository-level dependency from a machine-wide global install or a standalone binary install.

Do not add a dependency just to affect a count. Keep the existing global npm and binary installation paths for users who run TDK outside a project's package workflow. GitHub controls graph processing and display; its Code-tab “Used by” section has additional package and dependent-count criteria, so a correct declaration does not guarantee that sidebar will appear immediately. See [GitHub's dependency graph documentation](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-graph).

## Row format

Add one line per organization, in the same shape as the header below. Keep the row inside the table, with no blank line before it:

```markdown
| Organization name | https://example.com/public-link | x.y.z |
```

Do not copy that example into the table.

## List

| Organization | Link | TDK version |
| --- | --- | --- |
| Lekast | https://www.linkedin.com/company/lekast/ | 1.3.178 |
| mfin.services | https://medium.com/@mfin.services | 1.3.140 |
| MakeOffer | https://www.linkedin.com/company/makeofferio | 1.3.180 |
| Red Moon Digital | https://redmoon.digital/ | 1.3.81 |
