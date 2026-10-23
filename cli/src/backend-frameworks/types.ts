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
  /** Contents of `src/index.ts`. The health routes and the PORT read are part of the contract. */
  createIndex(name: string, durability?: string): string;
}
