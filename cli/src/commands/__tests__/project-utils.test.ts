// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { PROJECT_TEMPLATES } from "../../utils/project-templates.js";
import { templateTargetDir } from "../project.js";

describe("templateTargetDir", () => {
  it("returns targetDir when provided", () => {
    expect(templateTargetDir("demo", "/custom/path")).toBe("/custom/path");
    expect(templateTargetDir("restaurant", "my-app")).toBe("my-app");
    expect(templateTargetDir("unknown-template", "C:\\Users\\me\\proj")).toBe(
      "C:\\Users\\me\\proj",
    );
  });

  it("returns repo basename without .git when targetDir is undefined", () => {
    expect(templateTargetDir("demo")).toBe("tdk-restaurant-example");
    expect(templateTargetDir("restaurant")).toBe("tdk-restaurant-example");
    expect(templateTargetDir("saas")).toBe("tdk-saas-starter");
    expect(templateTargetDir("ecommerce")).toBe("tdk-ecommerce-example");
    expect(templateTargetDir("agent-stack")).toBe("tdk-agent-stack");
    expect(templateTargetDir("user-management")).toBe("tdk-user-management");

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
    expect(templateTargetDir("demo", "")).toBe("tdk-restaurant-example");
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
