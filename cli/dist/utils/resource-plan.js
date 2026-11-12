// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { writeFilesWithProgress } from "./file-helpers.js";
/** Collects the scaffold before any writes, so preview and creation use the same files. */
export class ResourceFilePlan {
    operations = [];
    directory(path) {
        this.operations.push({ kind: "directory", path });
    }
    text(path, content) {
        this.operations.push({ kind: "text", path, content });
    }
    files(path, tasks, options = {}) {
        this.operations.push({ kind: "tasks", path, tasks, exclusive: options.exclusive ?? false });
    }
    preview(projectRoot) {
        const files = new Set();
        const directories = new Set();
        const projectPath = (path) => relative(projectRoot, path).replace(/\\/g, "/");
        for (const operation of this.operations) {
            if (operation.kind === "directory") {
                if (!existsSync(operation.path))
                    directories.add(projectPath(operation.path));
            }
            else if (operation.kind === "text") {
                files.add(operation.path);
            }
            else {
                for (const task of operation.tasks)
                    files.add(resolve(operation.path, task.filename));
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
    write() {
        for (const operation of this.operations) {
            if (operation.kind === "directory") {
                mkdirSync(operation.path, { recursive: true });
            }
            else if (operation.kind === "text") {
                writeFileSync(operation.path, operation.content);
            }
            else {
                writeFilesWithProgress(operation.path, operation.tasks, undefined, {
                    exclusive: operation.exclusive,
                });
            }
        }
    }
}
