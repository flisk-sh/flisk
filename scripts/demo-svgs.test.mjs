// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//   node --test scripts/demo-svgs.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { Scene, render, aiDemo, cliDemo } from "./demo-svgs.mjs";

test("renders one-frame fixture with svg root element, width, and height", () => {
  const scene = new Scene({ width: 800, title: "Test Window", duration: 10 });
  scene.show('<text x="20" y="40">Hello Flisk</text>', 1.0, 5.0);
  const svg = scene.render(450, "Test Frame Label");

  // Assert root element
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.trimEnd().endsWith("</svg>"));

  // Assert root element attributes
  assert.match(svg, /^<svg\b[^>]*\bwidth="800"/);
  assert.match(svg, /^<svg\b[^>]*\bheight="450"/);
  assert.match(svg, /^<svg\b[^>]*\bviewBox="0 0 800 450"/);
  assert.match(svg, /^<svg\b[^>]*\brole="img"/);
  assert.match(svg, /^<svg\b[^>]*\baria-label="Test Frame Label"/);

  // Assert title element and scene chrome
  assert.match(svg, /<title>Test Frame Label<\/title>/);
  assert.match(svg, /<text[^>]*>Test Window<\/text>/);

  // Assert frame body and animation styles
  assert.match(svg, /<g class="anim a0 transient"><text x="20" y="40">Hello Flisk<\/text><\/g>/);
  assert.match(svg, /@keyframes a0/);
  assert.match(svg, /prefers-reduced-motion: reduce/);
});

test("standalone render function invokes scene render on a fixture", () => {
  const scene = new Scene({ width: 640, title: "Helper Scene", duration: 5 });
  scene.show('<circle cx="20" cy="20" r="10"/>', 0.5);
  const svg = render(scene, 320, "Helper Label");

  assert.match(svg, /^<svg\b[^>]*\bwidth="640"/);
  assert.match(svg, /^<svg\b[^>]*\bheight="320"/);
  assert.match(svg, /aria-label="Helper Label"/);
  assert.match(svg, /<circle cx="20" cy="20" r="10"\/>/);
});

test("renders typed text with cursor and clipPath in fixture", () => {
  const scene = new Scene({ width: 700, title: "Typed Fixture", duration: 6 });
  scene.typed({
    x: 20,
    y: 50,
    size: 14,
    font: "monospace",
    color: "#f4f7f6",
    text: "flisk up",
    t0: 1.0,
    t1: 2.5,
    bg: "#0c1417",
    clipRight: 680,
  });
  const svg = scene.render(250, "Typed Fixture Label");

  assert.match(svg, /@keyframes c0/);
  assert.match(svg, /<clipPath id="kc0">/);
  assert.match(svg, /flisk up/);
});

test("aiDemo and cliDemo render expected full svg demos", () => {
  const aiSvg = aiDemo();
  assert.ok(aiSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(aiSvg.trimEnd().endsWith("</svg>"));
  assert.match(aiSvg, /width="900"/);
  assert.match(aiSvg, /height="548"/);
  assert.match(aiSvg, /aria-label="An AI coding agent builds a small online shop with Flisk and runs it locally"/);

  const cliSvg = cliDemo();
  assert.ok(cliSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(cliSvg.trimEnd().endsWith("</svg>"));
  assert.match(cliSvg, /width="900"/);
  assert.match(cliSvg, /height="540"/);
  assert.match(cliSvg, /aria-label="Four flisk commands create a project, an API, and a website, then start them"/);
});
