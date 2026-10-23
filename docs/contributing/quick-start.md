# Quick start for contributors

From a fresh clone to your first passing test run and pull request in about five minutes. For the full walkthrough, see [Get ready to make a change](01-first-change.md).

## 1. Prerequisites

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh)
- [Node.js](https://nodejs.org/) 22.12 or newer
- [Docker](https://docs.docker.com/get-docker/) and [Tilt](https://docs.tilt.dev/install.html), only if you want to run a full local stack. Most changes do not need them.

## 2. Clone and install

Fork the repository on GitHub, then:

```bash
git clone https://github.com/<your-username>/flisk.git
cd flisk
bun install
git switch -c my-change
```

## 3. Run the tests

```bash
npm --prefix cli test
```

CI runs this on Linux with Docker and Tilt available. On a machine without them, a few tests that start or inspect a stack can fail; compare with the latest CI run on `main` before assuming you broke something.

## 4. Run the linter

```bash
npm --prefix cli run lint
```

## 5. Build the CLI

```bash
npm --prefix cli run build
```

## 6. Try your build

```bash
node cli/bin/tdk.js --help
```

## 7. Check your machine

```bash
node cli/bin/tdk.js doctor
```

`doctor` reports whether Docker, Tilt, and the other runtime pieces are ready. It changes nothing. Failures for Docker or Tilt are fine if you only work on the CLI.

`node cli/bin/tdk.js demo` is the full one-command demo, not a preview: it clones the demo project into `~/.flisk/flisk-demo`, installs `flisk` globally, and starts the stack. Run it only once Docker and Tilt are set up.

## 8. Make a change

Edit a file, then rerun the checks from steps 3 to 5. Commit with a [DCO](../../CONTRIBUTING.md) sign-off:

```bash
git add path/to/your/files
git commit -s -m "docs: describe the change"
```

`-s` adds the `Signed-off-by:` line a pull request check requires.

## 9. Open a pull request

```bash
git push -u origin my-change
```

On GitHub, open a pull request from your branch against `main`, and put `Fixes #<issue-number>` in the description. [Check your change and open a pull request](03-open-a-pr.md) covers the template and what CI runs.
