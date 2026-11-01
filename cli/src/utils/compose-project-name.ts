// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * Converts a project name to its Compose-safe prefix by replacing hyphens with underscores.
 */
export function toComposeProjectName(projectName: string): string {
  return projectName.replace(/-/g, "_");
}
