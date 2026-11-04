// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { PROJECT_TEMPLATES } from "../../utils/project-templates.js";
import { lastLine, templateTargetDir } from "../project.js";

describe("templateTargetDir", () => {
  it("returns targetDir when provided", () => {
    expect(templateTargetDir("demo", "/custom/path")).toBe("/custom/path");
    expect(templateTargetDir("restaurant", "my-app")).toBe("my-app");
    expect(templateTargetDir("unknown-template", "C:\\Users\\me\\proj")).toBe(
      "C:\\Users\\me\\proj",
    );
  });

  it("returns repo basename without .git when targetDir is undefined", () => {
    expect(templateTargetDir("demo")).toBe("flisk-restaurant-example");
    expect(templateTargetDir("restaurant")).toBe("flisk-restaurant-example");
    expect(templateTargetDir("saas")).toBe("flisk-saas-starter");
    expect(templateTargetDir("ecommerce")).toBe("flisk-ecommerce-example");
    expect(templateTargetDir("agent-stack")).toBe("flisk-agent-stack");
    expect(templateTargetDir("user-management")).toBe("flisk-user-management");

    for (const [name, template] of Object.entries(PROJECT_TEMPLATES)) {
      const repoBase = template.repo.split("/").pop() ?? name;
      const expected = repoBase.replace(/\.git$/, "");
      expect(templateTargetDir(name), name).toBe(expected);
    }
  });

  it("returns templateName when the template is unknown (no repo)", () => {
    expect(templateTargetDir("not-a-real-template")).toBe("not-a-real-template");
    expect(templateTargetDir("custom-local")).toBe("custom-local");
  });

  it("handles empty strings", () => {
    // Empty targetDir is falsy, so the template/repo path is used instead.
    expect(templateTargetDir("demo", "")).toBe("flisk-restaurant-example");
    expect(templateTargetDir("", "/still/used")).toBe("/still/used");
    expect(templateTargetDir("")).toBe("");
  });

  it("handles special characters in paths and names", () => {
    expect(templateTargetDir("demo", "path with spaces/my-app")).toBe("path with spaces/my-app");
    expect(templateTargetDir("demo", "./rel/../weird")).toBe("./rel/../weird");
    expect(templateTargetDir("demo", "name@v1#frag")).toBe("name@v1#frag");
    expect(templateTargetDir("weird$name!")).toBe("weird$name!");
    // Unknown name ending in .git still has the suffix stripped.
    expect(templateTargetDir("local-thing.git")).toBe("local-thing");
  });
});

describe("lastLine", () => {
  it("returns the final non-empty line of a multi-line string", () => {
    expect(lastLine("line one\nline two\nline three")).toBe("line three");
    expect(lastLine("error: clone failed\nfatal: destination path already exists\n")).toBe(
      "fatal: destination path already exists",
    );
    expect(lastLine("first line\nsecond line\n   \n\t\n")).toBe("second line");
  });

  it("returns \x27unknown error\x27 for empty or whitespace-only input", () => {
    expect(lastLine("")).toBe("unknown error");
    expect(lastLine("   \n\n\t  \n")).toBe("unknown error");
  });

  it("returns the trimmed single line for single-line input", () => {
    expect(lastLine("  just one error message  ")).toBe("just one error message");
  });
});
