// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Draws the two animated README demos as self-contained SVG (CSS animation, no fonts or scripts to load):
//   docs/assets/demo-ai.svg   a person asks an AI coding agent for an app; the agent runs flisk and reports the URLs
//   docs/assets/demo-cli.svg  the same four flisk commands typed in a terminal
// Command output is copied from real runs of flisk 1.3.207 on a fresh folder: `project` and `resource` ran for real,
// and the `up` lines (service list and URLs) come from `flisk up shop --dry-run`, which prints them before Tilt
// starts. Starting the containers was not captured, so the demos show what Flisk prints, not a verified live app.
// The agent's chat lines are an example session. Re-check the output lines when the CLI wording changes.
// Run: node scripts/demo-svgs.mjs
import { writeFileSync } from "node:fs";

const outFile = (name) => new URL(`../docs/assets/${name}`, import.meta.url);

// The URLs `flisk up shop` prints for this project. Both demos read them from here so they cannot disagree.
const URLS = {
  storefront: "http://app.my-shop.localhost/shop-web/health",
  api: "http://api.my-shop.localhost/api/orders/health",
};

// Brand palette from docs/branding.md, tuned for text on the dark window.
const C = {
  ink: "#0c1417",
  slate: "#1b2a30",
  line: "#26383f",
  signal: "#61f0d3",
  paper: "#f4f7f6",
  mist: "#9aa6aa",
  dim: "#62737a",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const CHAR = 0.61; // monospace advance as a share of the font size

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class Scene {
  constructor({ width, title, duration }) {
    this.width = width;
    this.title = title;
    this.duration = duration;
    this.body = [];
    this.css = [];
    this.n = 0;
  }

  pct(t) {
    return Math.min(100, Math.max(0, (t / this.duration) * 100)).toFixed(2);
  }

  // Shows `svg` from tIn until tOut (or until the loop fades everything out).
  show(svg, tIn, tOut) {
    const id = `a${this.n++}`;
    const end = tOut ?? this.duration - 0.6;
    const p = [tIn, tIn + 0.2, end, end + 0.2].map((t) => this.pct(t));
    this.css.push(
      `@keyframes ${id}{0%,${p[0]}%{opacity:0}${p[1]}%,${p[2]}%{opacity:1}${p[3]}%,100%{opacity:0}}`,
      `.${id}{opacity:0;animation:${id} ${this.duration}s linear infinite}`,
    );
    this.body.push(`<g class="anim ${id}${tOut ? " transient" : ""}">${svg}</g>`);
  }

  // Types `text` at (x, y) between t0 and t1 with a moving cursor. `before` (SVG, `beforeChars` monospace
  // characters wide) is shown at once, like a shell prompt.
  // The cover slides right as it reveals, so it is clipped at `clipRight` to stay inside its panel.
  typed({ x, y, size, font, color, text, t0, t1, bg, clipRight, before = "", beforeChars = 0 }) {
    const beforeW = beforeChars * size * CHAR;
    const textW = text.length * size * CHAR;
    const startX = x + beforeW;
    const id = `c${this.n++}`;
    const clip = `k${id}`;
    const [p0, p1, p2] = [t0, t1, t1 + 0.3].map((t) => this.pct(t));
    this.css.push(
      `@keyframes ${id}{0%,${p0}%{transform:translateX(0);opacity:1;animation-timing-function:steps(${text.length},end)}` +
        `${p1}%{transform:translateX(${textW.toFixed(1)}px);opacity:1}` +
        `${p2}%,100%{transform:translateX(${textW.toFixed(1)}px);opacity:0}}`,
      `.${id}{animation:${id} ${this.duration}s linear infinite}`,
    );
    const top = y - size * 1.05;
    const h = size * 1.45;
    this.show(
      `${before}<text x="${startX.toFixed(1)}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" xml:space="preserve">${esc(text)}</text>` +
        `<clipPath id="${clip}"><rect x="${(startX - 2).toFixed(1)}" y="${top.toFixed(1)}" width="${(clipRight - startX + 2).toFixed(1)}" height="${h.toFixed(1)}"/></clipPath>` +
        `<g clip-path="url(#${clip})"><g class="cover ${id}"><rect x="${(startX - 1).toFixed(1)}" y="${top.toFixed(1)}" width="${(textW + size * 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${bg}"/>` +
        `<rect x="${startX.toFixed(1)}" y="${top.toFixed(1)}" width="${(size * CHAR).toFixed(1)}" height="${h.toFixed(1)}" fill="${C.signal}" opacity="0.85"/></g></g>`,
      t0,
    );
  }

  render(height, label) {
    const w = this.width;
    const chrome = [
      `<rect x="0.5" y="0.5" width="${w - 1}" height="${height - 1}" rx="12" fill="${C.ink}" stroke="${C.line}"/>`,
      `<path d="M0.5 36 V12.5 a12 12 0 0 1 12 -12 H${w - 12.5} a12 12 0 0 1 12 12 V36 Z" fill="${C.slate}"/>`,
      `<line x1="0.5" y1="36" x2="${w - 0.5}" y2="36" stroke="${C.line}"/>`,
      ...[20, 38, 56].map((cx) => `<circle cx="${cx}" cy="18" r="5" fill="${C.line}"/>`),
      `<text x="${w / 2}" y="22.5" text-anchor="middle" font-family="${SANS}" font-size="12.5" fill="${C.mist}">${esc(this.title)}</text>`,
    ];
    const style = [
      ...this.css,
      "@media (prefers-reduced-motion: reduce){.anim{animation:none!important;opacity:1!important}.cover,.transient{display:none}}",
    ].join("\n");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<style>
${style}
</style>
${chrome.join("\n")}
${this.body.join("\n")}
</svg>
`;
  }
}

const sansText = (x, y, text, { size = 15, color = C.paper, weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text>`;
const monoText = (x, y, text, { size = 14, color = C.paper } = {}) =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" fill="${color}" xml:space="preserve">${esc(text)}</text>`;

function aiDemo() {
  const s = new Scene({ width: 900, title: "AI coding agent  ·  ~/my-shop", duration: 17 });
  const left = 36;

  // The request, in the person's own words.
  s.show(sansText(left, 70, "You", { size: 12.5, color: C.mist, weight: 600 }), 0.3);
  s.show(`<rect x="${left - 12}" y="80" width="${900 - 2 * (left - 12)}" height="66" rx="10" fill="${C.slate}"/>`, 0.3);
  const ask = { size: 15.5, font: SANS, color: C.paper, bg: C.slate, clipRight: 900 - (left - 12) - 2 };
  s.typed({ ...ask, x: left, y: 106, text: "Build me a small online shop with a storefront and an orders API,", t0: 0.7, t1: 2.6 });
  s.typed({ ...ask, x: left, y: 131, text: "and run it on my laptop.", t0: 2.7, t1: 3.4 });

  // The agent's plan, step by step in plain words, with the real command beside each step.
  s.show(
    `<circle cx="${left + 4}" cy="180" r="4" fill="${C.signal}"/>` +
      sansText(left + 16, 184.5, "Agent", { size: 12.5, color: C.signal, weight: 600 }),
    4.0,
  );
  s.show(sansText(left, 212, "On it. I'll use Flisk to set up and run everything.", { size: 15.5 }), 4.3);

  const steps = [
    ["Create the project", "flisk project --yes"],
    ["Add the orders API", "flisk resource orders-api --type backend --stack shop --yes"],
    ["Add the storefront", "flisk resource shop-web --type frontend --stack shop --yes"],
    ["Start everything", "flisk up shop"],
  ];
  steps.forEach(([label, command], i) => {
    const y = 250 + i * 30;
    const t = 5.0 + i * 1.15;
    s.show(sansText(left + 22, y, label, { size: 15 }) + monoText(330, y, command, { size: 13, color: C.dim }), t);
    s.show(`<circle cx="${left + 6}" cy="${y - 5}" r="6" fill="none" stroke="${C.dim}" stroke-width="1.5"/>`, t, t + 0.75);
    s.show(
      `<circle cx="${left + 6}" cy="${y - 5}" r="7" fill="${C.signal}"/>` +
        `<path d="M${left + 2.5} ${y - 5} l2.5 2.5 l4.5 -5" fill="none" stroke="${C.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
      t + 0.75,
    );
  });

  // The result: where to open the app.
  s.show(sansText(left, 392, "Flisk prints where your shop will be on your computer:", { size: 15.5 }), 10.0);
  s.show(`<rect x="${left - 12}" y="406" width="${900 - 2 * (left - 12)}" height="78" rx="10" fill="${C.slate}"/>`, 10.4);
  s.show(
    sansText(left, 437, "Storefront health", { size: 14, color: C.mist }) +
      monoText(180, 437, URLS.storefront, { size: 14.5, color: C.signal }),
    10.6,
  );
  s.show(
    sansText(left, 467, "Orders API health", { size: 14, color: C.mist }) +
      monoText(180, 467, URLS.api, { size: 14.5, color: C.signal }),
    10.9,
  );
  s.show(
    sansText(left, 516, "I didn't write any Docker, server, or routing setup. Flisk did that part.", { size: 15, color: C.mist }),
    11.8,
  );

  return s.render(548, "An AI coding agent builds a small online shop with Flisk and runs it locally");
}

function cliDemo() {
  const s = new Scene({ width: 900, title: "Terminal  ·  ~/my-shop", duration: 18 });
  const x = 28;
  const size = 14;
  const lh = 22;
  let y = 68;
  const prompt = (yy) =>
    monoText(x, yy, "~/my-shop", { size, color: C.signal }) + monoText(x + 9 * size * CHAR, yy, " $ ", { size, color: C.mist });

  const comment = (text, t) => {
    s.show(monoText(x, y, text, { size, color: C.dim }), t);
    y += lh;
  };
  const command = (text, t0, t1) => {
    s.typed({ x, y, size, font: MONO, color: C.paper, text, t0, t1, bg: C.ink, clipRight: 896, before: prompt(y), beforeChars: 12 });
    y += lh;
  };
  const out = (text, t, color = C.mist) => {
    s.show(monoText(x, y, text, { size, color }), t);
    y += lh;
  };
  const gap = () => {
    y += 10;
  };

  comment("# 1. Start a project", 0.3);
  command("flisk project --yes", 0.7, 1.9);
  out("✓ Created: .flisk/project.json", 2.3);
  out("✓ Created: .env (the defaults work as-is)", 2.5);
  out("✅ Project configuration complete!", 2.7, C.paper);
  gap();
  comment("# 2. Add an API", 3.5);
  command("flisk resource orders-api --type backend --stack shop --yes", 3.8, 6.0);
  out("✅ Resource created successfully!", 6.3, C.paper);
  gap();
  comment("# 3. Add a website", 7.0);
  command("flisk resource shop-web --type frontend --stack shop --yes", 7.3, 9.4);
  out("✅ Resource created successfully!", 9.7, C.paper);
  gap();
  comment("# 4. Run it all", 10.4);
  command("flisk up shop", 10.7, 11.4);
  out('Starting 2 services from stack "shop"...', 11.8);
  out("🌍 Frontend URLs:", 12.1);
  out(`  - shop-web: ${URLS.storefront}`, 12.3, C.signal);
  out("🔧 Backend API URLs:", 12.5);
  out(`  - orders-api: ${URLS.api}`, 12.7, C.signal);
  gap();
  comment("# You wrote no Dockerfile, Compose file, routing, or secrets. Flisk did.", 13.6);

  return s.render(y + 14, "Four flisk commands create a project, an API, and a website, then start them");
}

writeFileSync(outFile("demo-ai.svg"), aiDemo());
writeFileSync(outFile("demo-cli.svg"), cliDemo());
console.log("wrote docs/assets/demo-ai.svg and docs/assets/demo-cli.svg");
