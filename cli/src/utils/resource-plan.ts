// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { FileGenerationTask } from "../types/index.js";
import { writeFilesWithProgress } from "./file-helpers.js";

type ResourceOperation =
  | { kind: "directory"; path: string }
  | { kind: "text"; path: string; content: string }
  | { kind: "tasks"; path: string; tasks: FileGenerationTask[]; exclusive: boolean };

/** Collects the scaffold before any writes, so preview and creation use the same files. */
export class ResourceFilePlan {
  private operations: ResourceOperation[] = [];

  directory(path: string): void {
    this.operations.push({ kind: "directory", path });
  }

  text(path: string, content: string): void {
    this.operations.push({ kind: "text", path, content });
  }

  files(path: string, tasks: FileGenerationTask[], options: { exclusive?: boolean } = {}): void {
    this.operations.push({ kind: "tasks", path, tasks, exclusive: options.exclusive ?? false });
  }

  preview(projectRoot: string): {
    files: { path: string; action: "create" | "update" }[];
    directories: string[];
  } {
    const files = new Set<string>();
    const directories = new Set<string>();
    const projectPath = (path: string): string => relative(projectRoot, path).replace(/\\/g, "/");
    for (const operation of this.operations) {
      if (operation.kind === "directory") {
        if (!existsSync(operation.path)) directories.add(projectPath(operation.path));
      } else if (operation.kind === "text") {
        files.add(operation.path);
      } else {
        for (const task of operation.tasks) files.add(resolve(operation.path, task.filename));
      }
    }
    return {
      files: [...files].map((path) => ({
        path: projectPath(path),
        action: existsSync(path) ? "update" : "create",
      })),
      directories: [...directories],
    };
  }

  write(): void {
    for (const operation of this.operations) {
      if (operation.kind === "directory") {
        mkdirSync(operation.path, { recursive: true });
      } else if (operation.kind === "text") {
        writeFileSync(operation.path, operation.content);
      } else {
        writeFilesWithProgress(operation.path, operation.tasks, undefined, {
          exclusive: operation.exclusive,
        });
      }
    }
  }
}
