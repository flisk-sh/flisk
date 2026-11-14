// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface BackendFrameworkProvider {
  id: string;
  label: string;
  /** Runtime dependencies written to the service's package.json. */
  dependencies: Record<string, string>;
  /** Extra dev dependencies (type packages) written to the service's package.json. */
  devDependencies: Record<string, string>;
  /** Extra `compilerOptions` for the service's tsconfig.json (for example decorators). */
  compilerOptions?: Record<string, unknown>;
  /**
   * Contents of `src/index.ts`. The health routes and the PORT read are part of the contract.
   * `durability` selects agent persistence; `options.port` sets the PORT fallback (default 3000)
   * and must be an integer from 1 to 65535.
   */
  createIndex(name: string, durability?: string, options?: { port?: number }): string;
  /** Contents of `tests/<name>.test.ts`, in place of the shared placeholder test. */
  createTest?(name: string): string;
}
