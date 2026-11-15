// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { currentDockerContext, kiriBuildEnv } from "./container-engine.js";

// Runs first, so every docker and tilt process this CLI starts inherits the engine's build settings.
Object.assign(
  process.env,
  kiriBuildEnv(
    process.env,
    currentDockerContext(homedir(), (path) => readFileSync(path, "utf-8")),
  ),
);
