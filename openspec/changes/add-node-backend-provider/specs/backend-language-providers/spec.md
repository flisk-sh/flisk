# Backend Language Provider: Node.js

## Requirement: Node.js Backend Provider Registration

The CLI SHALL register `node` as a valid backend language provider in `BACKEND_LANGUAGES`.
When `--language node` (case-insensitive) is passed to `flisk resource <name> --type backend`, the CLI SHALL scaffold a Node.js 22 service and set `"language": "node"` in `service.json`.

## Requirement: Scaffolding Artifacts

The Node.js provider SHALL produce:
1. `package.json` configured with `"type": "module"` and npm scripts for `dev` (`node --watch src/index.js`), `start` (`node src/index.js`), and `test` (`node --test`).
2. `src/index.js` implementing a zero-dependency HTTP server via `node:http` listening on `0.0.0.0:$PORT` and responding to `GET /health` with `{"status":"ok","service":"<name>"}`.
3. `tests/health.test.js` exercising `GET /health` using `node:test` and `node:assert/strict`.

## Requirement: Container Build & Runtime

The engine SHALL generate a Dockerfile for `node` using `node:22-slim` containing:
1. A `base` stage installing curl and project dependencies via npm.
2. A `test` stage running `npm test`.
3. A `production` stage exposing `$PORT`, configured with an HTTP health check against `/health`, running `node src/index.js`.

## Requirement: Live Reload

Tilt SHALL sync files in `src/` directly into the running container without rebuilding the Docker image. Edits to `package.json` SHALL trigger a container image rebuild.
