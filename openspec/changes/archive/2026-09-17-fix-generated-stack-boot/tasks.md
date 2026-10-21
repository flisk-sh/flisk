## 1. Compilable Generated Backend Source

- [x] 1.1 Update `getBackendIndexTemplate` in `cli/src/commands/resource.ts` so the emitted banner lines use `\\n` (escaped backslash-n): `console.log('\n...')` becomes two characters in generated files
- [x] 1.2 Generate a backend service with the CLI and assert `src/index.ts` has no raw newline inside the `console.log` string
- [x] 1.3 Boot the generated service with `bun run src/index.ts` and assert `GET /health` returns `{"status":"ok","service":"<name>"}`

## 2. Extension Vendored Into Generated Projects

- [x] 2.1 Add `vendorTdkExtension(projectRoot)` to `cli/src/generator/template-engine.ts`, called from `generateMasterConfigs`, copying `Tiltfile`, `engine/`, `discovery/`, `specs/`, `ext/` into `.tdk/.tdk-out/tdk-cli-ext/`
- [x] 2.2 Resolve the extension source in order: `$TDK_EXTENSION_SOURCE` -> executable-adjacent `tdk-cli` checkout -> `../tdk-cli` sibling of the project root
- [x] 2.3 Print a warning (no hard failure) when no extension source is found
- [x] 2.4 Assert generation reports `Vendored TDK extension -> .tdk/.tdk-out/tdk-cli-ext/` and the directory exists

## 3. Tiltfile Extension Resolution

- [x] 3.1 Rewrite `cli/templates/Tiltfile.hbs`: resolve vendored path -> `$TDK_EXTENSION_PATH` -> `fail(...)` with the three recovery options; remove the hardcoded `/private/var/www/2025/ollamar1/tdk-cli` path and the private GitHub fallback
- [x] 3.2 Use truthful probes: `test -d <path> && echo yes || echo no` in both branches
- [x] 3.3 Assert a generated Tiltfile contains no absolute host-specific paths and no `github.com/flisk-sh/tdk-cli` URL
- [x] 3.4 Run `tilt ci -f .tdk/.tdk-out/Tiltfile` on a generated project and assert the vendored extension loads, services are discovered, and the workspace reports healthy
- [x] 3.5 Run `tdk up pre-alpha` on a two-service project and assert no git-clone retry loop; Tiltfile loading succeeds

## 4. Release Binaries

- [x] 4.1 Rebuild binaries from fixed source: `bun build --compile --target=bun-linux-amd64 --outfile tdk-linux-amd64 cli/src/cli.ts` (repeat for `bun-linux-arm64`, `bun-darwin-amd64`, `bun-darwin-arm64`)
- [x] 4.2 Verify each rebuilt binary: `--version` matches, `project --yes` vendors the extension, and a generated service compiles and boots
- [x] 4.3 Update `release-dist-*` snapshots, `checksums.txt`, and the binaries zip
- [x] 4.4 Publish binaries to `flisk-sh/tdk-cli-releases` releases with the fixed snapshots