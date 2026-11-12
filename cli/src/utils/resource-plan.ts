// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { FileGenerationTask } from "../types/index.js";
import { FliskError } from "./errors.js";
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
    const { files, directories } = this.validate();
    const projectPath = (path: string): string => relative(projectRoot, path).replace(/\\/g, "/");
    return {
      files: files.map((path) => ({
        path: projectPath(path),
        action: existsSync(path) ? "update" : "create",
      })),
      directories: directories.filter((path) => !existsSync(path)).map(projectPath),
    };
  }

  /** Check the entire plan before either reporting success or performing its first write. */
  private validate(): { files: string[]; directories: string[] } {
    const files = new Map<string, string>();
    const directories = new Set<string>();
    // A scaffold must also work on Windows and case-insensitive macOS volumes.
    const pathKey = (path: string): string => resolve(path).toLowerCase();
    const addFile = (path: string): void => {
      const key = pathKey(path);
      if (files.has(key)) {
        throw new FliskError(`Resource plan contains multiple writes to ${path}.`, [
          "Choose distinct paths for the generated files.",
        ]);
      }
      files.set(key, resolve(path));
    };
    for (const operation of this.operations) {
      if (operation.kind === "directory") {
        directories.add(resolve(operation.path));
      } else if (operation.kind === "text") {
        addFile(operation.path);
      } else {
        for (const task of operation.tasks) addFile(resolve(operation.path, task.filename));
      }
    }

    const checked = new Set<string>();
    for (const directory of [...directories, ...[...files.values()].map(dirname)]) {
      let path = directory;
      while (!checked.has(path)) {
        checked.add(path);
        if (files.has(pathKey(path))) {
          throw new FliskError(`Resource plan uses ${path} as both a file and a directory.`, [
            "Choose a path that does not overlap another generated file.",
          ]);
        }
        if (existsSync(path) && !statSync(path).isDirectory()) {
          throw new FliskError(`${path} is not a directory.`, [
            "Choose a resource or Dockerfile path whose parent folders are directories.",
          ]);
        }
        const parent = dirname(path);
        if (parent === path) break;
        path = parent;
      }
    }
    for (const path of files.values()) {
      if (existsSync(path) && statSync(path).isDirectory()) {
        throw new FliskError(`${path} is a directory; a generated file cannot be written there.`, [
          "Choose another file path or resource directory.",
        ]);
      }
    }
    return { files: [...files.values()], directories: [...directories] };
  }

  write(): void {
    this.validate();
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
