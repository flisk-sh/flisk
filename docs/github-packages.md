# Install from GitHub Packages

Public npm remains the recommended installation channel and the default registry. Use GitHub Packages when your environment prefers or requires packages from GitHub.

## Consumer setup

Create or update `~/.npmrc` with the scoped registry mapping and an environment-variable token reference:

```ini
@flisk-sh:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Create a classic GitHub personal access token with `read:packages` access (and any permissions required by your organization), then provide it through the environment without putting its value in a checked-in file:

```sh
export GITHUB_PACKAGES_TOKEN="<your-read:packages-token>"
npm install -g @flisk-sh/flisk
tdk --version
```

In CI, store the token as a secret and expose it as `GITHUB_PACKAGES_TOKEN` for the install step. Repository workflows may use `GITHUB_TOKEN` with `packages: read` when the package grants that repository access. Do not commit tokens or paste them into logs.

The mapping above only redirects the `@flisk-sh` scope. To return to the default public npm installation, remove that mapping and run:

```sh
npm install -g @flisk-sh/flisk
```

## Maintainer release checks

The release workflow publishes the same packed tarball to npm and GitHub Packages. The workflow token needs `packages: write`; no manually configured PAT is needed for publishing this repository's package.

To add an already released npm version to GitHub Packages without creating another npm or binary release, run **Actions → Publish existing npm version to GitHub Packages** and enter the existing version (for example, `1.3.186`). The workflow validates the npm package's repository metadata, downloads the exact public npm tarball, publishes it to GitHub Packages, and verifies an authenticated clean-prefix install.

After the first GitHub Packages publication:

1. Open the package under the repository's **Packages** tab and confirm it is connected to `flisk-sh/flisk`.
2. Check the package visibility. If it is restricted, change its visibility to public in the package settings so consumers can install it as intended.
3. Verify the released version with `npm view @flisk-sh/flisk@<version> --registry=https://npm.pkg.github.com`.

If the GitHub Packages publish job fails after npm publication, rerun the `publish-github-packages` job in the same workflow run while its artifact is retained. It downloads the exact tarball produced for that release and skips the version if it is already present. A failed package publish fails the workflow rather than silently reporting a complete dual publication.
