// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Helpers shared by CLI tests. This folder is excluded from the build and the npm package.

export { captureExit, type ExitCapture, makeResource } from "./doubles.js";
export { type Envelope, parseEnvelope } from "./parse-envelope.js";
export { type InProcessRun, runCommandInProcess } from "./run-in-process.js";
export { type RunTdkOptions, type RunTdkResult, runTdk, tdkBin } from "./run-tdk.js";
export {
  engineFile,
  evaluateStarlark,
  resolveTiltAvailability,
  type StarlarkOptions,
  type StarlarkRun,
  tiltAvailable,
} from "./starlark.js";
export {
  createTempDir,
  createTempProject,
  type ServiceSpec,
  type TempProjectSpec,
} from "./temp-project.js";
