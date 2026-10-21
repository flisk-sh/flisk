// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface FrontendFrameworkFile {
  filename: string;
  content: string;
  description: string;
  emoji: string;
}

export interface FrontendFrameworkProvider {
  id: string;
  label: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  compilerOptions: Record<string, string>;
  createFiles(name: string): FrontendFrameworkFile[];
}
