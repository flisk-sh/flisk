// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { onTestFinished } from "vitest";

/** A `service.json` body. A string is written as given, which lets a test plant malformed JSON. */
export type ServiceSpec = Record<string, unknown> | string;

export interface TempProjectSpec {
  /**
   * `.tdk/project.json`. An object is serialized, a string is written as given. Defaults to `{}`.
   * Pass `null` for a directory without a `.tdk` folder.
   */
  projectJson?: Record<string, unknown> | string | null;
  /** `services/<stack>/<app>/service.json`, with `appName` and `stack` filled in. */
  stacks?: Record<string, Record<string, ServiceSpec>>;
  /** `services/<relative dir>/service.json`, with `appName` set to the last path segment. */
  resources?: Record<string, ServiceSpec>;
  /**
   * Files under `.tdk/.tdk-out`. A list creates empty files, a record maps file name to content.
   */
  generated?: readonly string[] | Record<string, string>;
  /** Any other files, keyed by path relative to the project root. */
  files?: Record<string, string>;
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function serialize(spec: ServiceSpec, defaults: Record<string, unknown>): string {
  return typeof spec === "string" ? spec : JSON.stringify({ ...defaults, ...spec });
}

/**
 * Creates a temporary tdk project on disk and returns its real path. It is removed when the current test finishes.
 * Call it from inside a test or a `beforeEach`.
 */
export function createTempProject(spec: TempProjectSpec = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tdk-test-project-")));
  onTestFinished(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { projectJson = {} } = spec;
  if (projectJson !== null) {
    write(
      path.join(root, ".tdk", "project.json"),
      typeof projectJson === "string" ? projectJson : `${JSON.stringify(projectJson)}\n`,
    );
  }
  for (const [stack, apps] of Object.entries(spec.stacks ?? {})) {
    for (const [app, service] of Object.entries(apps)) {
      write(
        path.join(root, "services", stack, app, "service.json"),
        serialize(service, { appName: app, stack }),
      );
    }
  }
  for (const [dir, service] of Object.entries(spec.resources ?? {})) {
    write(
      path.join(root, "services", dir, "service.json"),
      serialize(service, { appName: path.basename(dir) }),
    );
  }
  const generated = spec.generated ?? {};
  const generatedFiles: Record<string, string> = Array.isArray(generated)
    ? Object.fromEntries(generated.map((name) => [name, ""]))
    : (generated as Record<string, string>);
  for (const [name, content] of Object.entries(generatedFiles)) {
    write(path.join(root, ".tdk", ".tdk-out", name), content);
  }
  for (const [relative, content] of Object.entries(spec.files ?? {})) {
    write(path.join(root, relative), content);
  }
  return root;
}

/** Creates an empty temporary directory that is removed when the current test finishes. */
export function createTempDir(prefix = "tdk-test-dir-"): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  onTestFinished(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
