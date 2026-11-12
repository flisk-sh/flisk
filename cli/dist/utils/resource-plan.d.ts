import type { FileGenerationTask } from "../types/index.js";
/** Collects the scaffold before any writes, so preview and creation use the same files. */
export declare class ResourceFilePlan {
    private operations;
    directory(path: string): void;
    text(path: string, content: string): void;
    files(path: string, tasks: FileGenerationTask[], options?: {
        exclusive?: boolean;
    }): void;
    preview(projectRoot: string): {
        files: {
            path: string;
            action: "create" | "update";
        }[];
        directories: string[];
    };
    /** Check the entire plan before either reporting success or performing its first write. */
    private validate;
    write(): void;
}
