// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT_TEMPLATES } from "../project-templates.js";
import { stripTemplateExtras } from "../template-extras.js";

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "flisk-template-extras-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("stripTemplateExtras", () => {
  it("removes presentation files and every README link that points at them (#4301)", () => {
    const root = tempDir();
    writeFileSync(join(root, "SALES_PITCH.md"), "pitch");
    writeFileSync(join(root, "DEMO_GUIDE.md"), "guide");
    writeFileSync(join(root, "README.md"), [
      "├── SALES_PITCH.md",
      "├── DEMO_GUIDE.md",
      "",
      "- 📊 **[Sales Pitch Deck (SALES_PITCH.md)](SALES_PITCH.md):** Executive problem statement, core value pillars, and",
      "ROI metrics.",
      "- 🎬 **[Demo Walkthrough Guide (DEMO_GUIDE.md)](DEMO_GUIDE.md):** Step-by-step playbook",
      "for sales engineers.",
      "",
      '<a href="SALES_PITCH.md">Sales Pitch</a>',
      '<a href="DEMO_GUIDE.md">Demo Guide</a>',
      "",
      "See [the running app](docs/app.md) and ![screenshot](docs/app.png).",
      "",
    ].join("\n"));

    const removed = stripTemplateExtras(root, ["SALES_PITCH.md", "DEMO_GUIDE.md"]);

    expect(removed).toEqual(["sales_pitch.md", "demo_guide.md"]);
    expect(existsSync(join(root, "SALES_PITCH.md"))).toBe(false);
    expect(existsSync(join(root, "DEMO_GUIDE.md"))).toBe(false);
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).not.toContain("SALES_PITCH");
    expect(readme).not.toContain("DEMO_GUIDE");
    expect(readme).not.toContain("ROI metrics");
    expect(readme).not.toContain("for sales engineers");
    expect(readme).toContain("See [the running app](docs/app.md) and ![screenshot](docs/app.png).");
  });

  it("removes a whole media directory and the image that links to it (#4285)", () => {
    const root = tempDir();
    mkdirSync(join(root, "video", "shots"), { recursive: true });
    writeFileSync(join(root, "video", "shots", "home.png"), "png");
    writeFileSync(join(root, "video", "film.json"), "film");
    writeFileSync(
      join(root, "README.md"),
      "![How it works](docs/demo.gif)\n\n[![demo](docs/demo.gif)](docs/demo.mp4)\n\n| film | `video/shots.ts` |\n",
    );
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "demo.gif"), "gif");
    writeFileSync(join(root, "docs", "demo.mp4"), "mp4");

    const removed = stripTemplateExtras(root, [
      "docs/demo.gif",
      "docs/demo.mp4",
      "video/shots",
    ]);

    expect(removed).toEqual(["docs/demo.gif", "docs/demo.mp4", "video/shots"]);
    expect(existsSync(join(root, "video", "shots"))).toBe(false);
    expect(existsSync(join(root, "video", "film.json"))).toBe(true);
    expect(existsSync(join(root, "docs", "demo.gif"))).toBe(false);
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).not.toContain("demo.gif");
    expect(readme).not.toContain("demo.mp4");
    expect(readme).toContain("| film | `video/shots.ts` |");
  });

  it("is a no-op when a template does not ship the listed paths", () => {
    const root = tempDir();
    writeFileSync(join(root, "README.md"), "Hello\n");
    expect(stripTemplateExtras(root, ["SALES_PITCH.md"])).toEqual([]);
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe("Hello\n");
  });
});

describe("starter catalog", () => {
  it("lists the marketing material each cloned starter ships", () => {
    for (const key of ["demo", "restaurant", "saas"]) {
      expect(PROJECT_TEMPLATES[key]?.omit, key).toContain("DEMO_GUIDE.md");
    }
    for (const key of ["erp", "user-management"]) {
      expect(PROJECT_TEMPLATES[key]?.omit, key).toEqual(
        expect.arrayContaining(["SALES_PITCH.md", "DEMO_GUIDE.md"]),
      );
    }
  });
});
