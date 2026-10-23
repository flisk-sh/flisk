// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface BackendLanguageFile {
  filename: string;
  content: string;
  description: string;
  emoji: string;
}

export interface BackendLanguageProvider {
  id: string;
  label: string;
  /**
   * Language-owned files for a new backend. `undefined` means the provider uses the shared
   * Bun/TypeScript scaffold in `resource.ts`; Bun is the only provider that does.
   */
  createFiles?(name: string): BackendLanguageFile[];
  /** Command Tilt reloads the service with; written to `service.json` `dev.command`. */
  devCommand?: string;
  /** Paths Tilt syncs into the container for live reload. */
  watch?: string[];
  /** Printed under "Next steps" after scaffolding. */
  installHint: string;
}
