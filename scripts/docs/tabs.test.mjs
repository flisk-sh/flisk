// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/docs/tabs.mjs, on a throwaway repo with one tab group.
//   node --test scripts/docs/tabs.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FRAME_KINDS, frameSvgs, WIDTH } from "./frames.mjs";
import { ASSETS, counterSvg, rewrite, run, tabSvg, textWidth } from "./tabs.mjs";

const SPEC = {
  groups: [
    {
      id: "os",
      count: "systems",
      dir: "docs/os",
      back: "README.md#setup",
      hosts: [{ file: "README.md", selected: "mac" }],
      tabs: [
        { slug: "mac", label: "macOS", icon: "laptop", title: "Set up macOS", frame: { kind: "macos", title: "~/shop", left: "up in 1 s", right: "M1" } },
        { slug: "linux", label: "Linux", icon: "server" },
      ],
    },
  ],
};
const README = "# Demo\n\n## Setup\n\n<!-- tabs:os mac -->\n<table>\n<tr><td></td></tr>\n<tr><td>\n\nRun `brew install x`.\n\n</td></tr>\n</table>\n<!-- /tabs:os -->\n\nAfter.\n";

const stubOf = (root) => readFileSync(path.join(root, "docs/os/linux.md"), "utf8");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "flisk-tabs-"));
  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(path.join(root, "docs/tabs.json"), JSON.stringify(SPEC));
  writeFileSync(path.join(root, "README.md"), README);
  return root;
}

test("textWidth sums Arial advances and rounds up", () => {
  assert.equal(textWidth("Codex", 14), Math.ceil(((722 + 556 + 556 + 556 + 500) * 14) / 1000));
  assert.ok(textWidth("Codex", 14, 600) > textWidth("Codex", 14, 400));
});

test("a tab has the same width selected and not, and only the selected one is underlined", () => {
  const plain = tabSvg({ label: "Claude Code", icon: "terminal" }, false);
  const selected = tabSvg({ label: "Claude Code", icon: "terminal" }, true);
  const width = (svg) => /width="(\d+)"/.exec(svg)[1];
  assert.equal(width(plain), width(selected));
  assert.match(selected, /class="u"/);
  assert.doesNotMatch(plain, /class="u"/);
  assert.match(selected, /prefers-color-scheme:dark/);
  assert.match(selected, /<title>Claude Code \(selected\)<\/title>/);
  assert.throws(() => tabSvg({ label: "X", icon: "nope" }, false), /unknown icon "nope"/);
  assert.match(counterSvg("3 agents"), /aria-label="3 agents"/);
});

test("rewrite replaces the bar, keeps the panel and reports a block the spec does not list", () => {
  const block = { group: { id: "os" }, embed: { selected: "mac" }, head: "<!-- tabs:os mac NEW -->\n<table>\n<tr><td>BAR</td></tr>\n<tr><td>\n\n", tail: "</td></tr>\n</table>\n<!-- /tabs:os -->" };
  const { text, problems } = rewrite(README, [block], "README.md");
  assert.deepEqual(problems, []);
  assert.match(text, /<tr><td>BAR<\/td><\/tr>\n<tr><td>\n\nRun `brew install x`.\n\n<\/td><\/tr>\n<\/table>\n<!-- \/tabs:os -->\n\nAfter.\n$/);
  assert.equal(rewrite(text, [block], "README.md").text, text, "rewriting twice changes nothing");
  assert.match(rewrite(README, [], "README.md").problems[0], /tabs:os block that docs\/tabs.json does not list/);
  assert.match(rewrite("# Empty\n", [block], "README.md").problems[0], /missing the tabs:os block/);
  const wide = README.replace("Run `brew install x`.", "```bash\n" + "x".repeat(89) + "\n" + "y".repeat(88) + "\n```");
  assert.deepEqual(rewrite(wide, [block], "README.md").problems, [
    "README.md: tabs:os panel has a 89-character code line; GitHub then widens the panel past the page. Keep code lines to 88 (end a shell line with \\)",
  ]);
});

test("write mode produces everything, then --check is clean; a hand edit or a stray image makes it stale", () => {
  const root = fixture();
  try {
    const first = run(root, { write: true });
    assert.deepEqual(first.problems, []);
    assert.ok(first.stale.length > 0);
    assert.deepEqual(run(root, { write: false }), { stale: [], problems: [] });

    const images = readdirSync(path.join(root, ASSETS, "os")).sort();
    assert.equal(images.length, 7, "two tabs in two states, the counter, and the macOS frame's top and bottom");
    assert.ok(images.every((name) => /^(mac|linux|count)(-selected|-top|-bottom)?\.[0-9a-f]{8}\.svg$/.test(name)));

    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    assert.match(readme, /<a href="docs\/os\/mac.md"><img src="docs\/assets\/tabs\/os\/mac-selected\.[0-9a-f]{8}\.svg" alt="macOS \(selected\)"/);
    assert.match(readme, /<table>\n<tr><td><img src="docs\/assets\/tabs\/os\/mac-top\.[0-9a-f]{8}\.svg" alt="macOS window: ~\/shop" width="100%" align="top"><\/td><\/tr>\n<tr><td><a /);
    assert.match(readme, /Run `brew install x`\.\n\n<\/td><\/tr>\n<tr><td><img src="docs\/assets\/tabs\/os\/mac-bottom\.[0-9a-f]{8}\.svg" alt="up in 1 s · M1" width="100%" align="top"><\/td><\/tr>\n<\/table>/);
    assert.doesNotMatch(stubOf(root), /-top\./, "a tab without a frame gets no frame rows");
    const stub = stubOf(root);
    assert.match(stub, /^# Linux\n\n\[← Back\]\(\.\.\/\.\.\/README\.md#setup\)/);
    assert.match(stub, /<a href="linux.md"><img src="\.\.\/assets\/tabs\/os\/linux-selected\./);

    writeFileSync(path.join(root, "README.md"), readme.replace('alt="Linux"', 'alt="Linux!"'));
    writeFileSync(path.join(root, ASSETS, "os", "old.svg"), "<svg/>");
    const { stale } = run(root, { write: false });
    assert.deepEqual(stale.sort(), ["README.md: tab bar out of date", "docs/assets/tabs/os/old.svg: not produced by docs/tabs.json"]);

    run(root, { write: true });
    assert.equal(existsSync(path.join(root, ASSETS, "os", "old.svg")), false);
    assert.deepEqual(run(root, { write: false }), { stale: [], problems: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every frame kind draws a top and a bottom at the frame width, and an unknown kind fails", () => {
  for (const kind of FRAME_KINDS) {
    const { top, bottom } = frameSvgs({ kind, title: "~/my-shop", left: "a:b$ c", right: "r", prompt: "p" }, kind);
    for (const svg of [top, bottom]) {
      assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="\\d+"`), kind);
      assert.match(svg, /<title>[^<]+<\/title>/, kind);
      if (svg.includes("animation:")) assert.match(svg, /@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\}/, kind);
    }
    if (["claude-code", "codex", "cursor", "ubuntu", "omarchy"].includes(kind)) {
      assert.match(bottom, /<text [^>]*xml:space="preserve"[^>]*textLength=/, `${kind} types its prompt`);
      assert.match(bottom, /\.ty\{transform:translateX\(\d+px\)/, `${kind}: a static render shows the whole prompt`);
    }
  }
  assert.throws(() => frameSvgs({ kind: "amiga" }, "os/mac"), /unknown frame "amiga" for os\/mac/);
});

test("a group with panel: false draws the bar alone and keeps the content after the block", () => {
  const root = fixture();
  try {
    const spec = structuredClone(SPEC);
    spec.groups[0].panel = false;
    delete spec.groups[0].tabs[0].frame;
    writeFileSync(path.join(root, "docs/tabs.json"), JSON.stringify(spec));
    writeFileSync(path.join(root, "README.md"), "# Demo\n\n<!-- tabs:os mac -->\n<!-- /tabs:os -->\n\n| a | b |\n| - | - |\n| 1 | 2 |\n");
    assert.deepEqual(run(root, { write: true }).problems, []);
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    assert.match(readme, /<table>\n<tr><td><a href="docs\/os\/mac.md"><img [^\n]*<\/td><\/tr>\n<\/table>\n<!-- \/tabs:os -->\n\n\| a \| b \|/);
    assert.doesNotMatch(readme, /<tr><td>\n/, "no panel row");
    assert.match(stubOf(root), /<!-- \/tabs:os -->\n\n_Write this tab._/);
    assert.deepEqual(run(root, { write: false }), { stale: [], problems: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
