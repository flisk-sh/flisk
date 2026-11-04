// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// "Is Flisk right for your team?" in Markdown: the flisk.sh/fit calculator as tabs. GitHub keeps no state, so every answer is a
// page: three tab bars (runtime, today's setup, number of services), and each tab links to the page with that one answer
// changed. 6 x 9 x 3 = 162 pages under docs/fit/, all generated. Each shows an animated score gauge, the verdict and the
// reasons. The README shows the default page between <!-- fit --> and <!-- /fit -->.
// The score is the website's (flisk-sh/website fit/index.html): 2 x runtime + 2 x setup + pains + services + team, out of 100,
// then capped so the verdict cannot contradict the reasons: 1 service stops at 40% (not a fit), 2-4 services at 74% (at most
// partial), and on the website "None, we're happy" stops at 60%. Pains and team size have no tabs here; they stay at the
// website's defaults (onboarding and drift, 10 developers) and every page shows them as assumed, so the default page scores
// the same 82% as flisk.sh/fit. Keep the weights and caps in step with the website.
//   node scripts/docs/fit.mjs [--root <repo dir>]           write everything
//   node scripts/docs/fit.mjs [--root <repo dir>] --check   exit 1 when anything is out of date (D5 in
//                                                           tests/e2e/static/skills-and-docs.sh)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textWidth } from "./metrics.mjs";
import { tabSvg } from "./tabs.mjs";

export const PAGES = "docs/fit";
export const ASSETS = "docs/assets/fit";
const GENERATOR = "scripts/docs/fit.mjs";

// Weights follow what the CLI ships (docs/backend-language-providers.md): Node, TypeScript and Bun are the default generators
// and golden images; Python and Go have backend scaffolds (`--language`); the rest run from your own Dockerfile or a `command`.
export const RUNTIMES = [
  { slug: "node", label: "JavaScript / TypeScript", name: "JavaScript or TypeScript (Node.js, Bun)", value: 10,
    mark: "yes", reason: "Flisk is made for JavaScript and TypeScript apps first." },
  { slug: "python", label: "Python", name: "Python", value: 9,
    mark: "yes", reason: "Flisk can create Python parts for you (`flisk resource … --language python`), and there is a [ready example](../../examples/one-backend-python/README.md)." },
  { slug: "go", label: "Go", name: "Go", value: 9,
    mark: "yes", reason: "Flisk can create Go parts for you (`flisk resource … --language go`)." },
  { slug: "jvm", label: "Java / Kotlin", name: "Java or Kotlin", value: 6,
    mark: "partly", reason: "Flisk runs Java apps, but cannot create new Java parts for you yet. Developers keep their own setup file." },
  { slug: "ruby-php", label: "Ruby / PHP", name: "Ruby or PHP", value: 6,
    mark: "partly", reason: "Flisk runs Ruby and PHP apps, but cannot create new parts in them for you yet. Developers keep their own setup file." },
  { slug: "other", label: "Other / not sure", name: "Something else, or not sure", value: 5,
    mark: "partly", reason: "Flisk runs apps in any language. It can create new parts in JavaScript, TypeScript, Python, Go and Rust." },
];

export const SETUPS = [
  { slug: "kubernetes", label: "Kubernetes", name: "Kubernetes on each laptop", value: 10,
    mark: "yes", reason: "Each laptop runs a mini cloud just to work on the app. Flisk runs the same app without it: lighter and simpler." },
  { slug: "mixed", label: "Scripts + a wiki", name: "Scripts, a wiki and manual steps", value: 9,
    mark: "yes", reason: "Every laptop is set up a little differently. Flisk gives everyone the same setup, from one small file per part." },
  { slug: "compose", label: "Docker Compose", name: "Docker Compose", value: 8,
    mark: "yes", reason: "Your team already uses containers. Flisk writes those setup files for them and keeps them in sync." },
  { slug: "orchestrator", label: "Tilt or Skaffold", name: "Tilt, Skaffold, Garden or DevSpace", value: 8,
    mark: "yes", reason: "Your team already uses a tool like this. Flisk writes its settings and adds checks that explain what is wrong." },
  { slug: "container-ui", label: "A Docker app", name: "A Docker desktop app (OrbStack, Rancher Desktop, Portainer)", value: 7,
    mark: "partly", reason: "A Docker app shows what is running. Flisk also starts every part together, the same way every time." },
  { slug: "dev-containers", label: "Dev Containers", name: "Dev Containers in VS Code", value: 6,
    mark: "partly", reason: "Dev Containers give everyone the same tools. Flisk adds starting all the parts of the app together." },
  { slug: "cloud-ide", label: "In the browser", name: "A cloud workspace in the browser (Codespaces, Gitpod, Coder)", value: 5,
    mark: "partly", reason: "Cloud workspaces run in the browser and are paid per person. Flisk runs the same app on each laptop, and the Flisk CLI is free." },
  { slug: "native", label: "Just run the code", name: "They just run the code, no Docker", value: 8,
    mark: "yes", reason: "No Docker needed: Flisk starts each part with the command your team already uses." },
  { slug: "other", label: "Other / not sure", name: "Something else, or not sure", value: 5,
    mark: "partly", reason: "It may fit. Compare how your team starts the app today with how Flisk does it." },
];

export const SIZES = [
  { slug: "1", label: "Just one", name: "1 part", count: 1 },
  { slug: "2-4", label: "2–4 parts", name: "2–4 parts", count: 3 },
  { slug: "5-plus", label: "5 or more", name: "5 or more parts", count: 8 },
];

// The website's defaults for the inputs that have no tabs here.
const PAINS = [
  "New developers start with two commands (`flisk doctor`, `flisk up`) instead of a long setup guide. Not yet timed with real new hires.",
  "Every laptop gets the same base setup, so \"it works on my machine\" happens less.",
];
const PAIN_POINTS = 6;
const TEAM = 10;

export function serviceScore(n) {
  if (n <= 1) return 4;
  if (n < 5) return Math.round(4 + ((n - 1) / 4) * 16);
  return 20;
}

export function teamScore(n) {
  if (n < 5) return 6;
  if (n < 10) return 10;
  if (n < 30) return 14;
  return 16;
}

// The verdict must not contradict the reasons, so some answers cap the score.
export function cap(size) {
  if (size.count <= 1) return { limit: 40, why: "Only one part: Flisk is for apps with several parts, so the score stops at 40%." };
  if (size.count < 5) return { limit: 74, why: "Fewer than 5 parts: the score stops at 74%." };
  return null;
}

// The score with its parts, so every page can show how it adds up.
export function score(runtime, setup, size) {
  const parts = [
    { name: "Language", answer: runtime.name, points: runtime.value * 2, max: 20 },
    { name: "How you start it today", answer: setup.name, points: setup.value * 2, max: 20 },
    { name: "Pains (we assumed)", answer: "Slow onboarding, laptops that differ", points: PAINS.length * PAIN_POINTS, max: 24 },
    { name: "Parts", answer: size.name, points: serviceScore(size.count), max: 20 },
    { name: "Team size (we assumed)", answer: `${TEAM} developers`, points: teamScore(TEAM), max: 16 },
  ];
  const raw = parts.reduce((sum, part) => sum + part.points, 0);
  const limit = cap(size);
  const total = Math.max(0, Math.min(100, limit ? Math.min(raw, limit.limit) : raw));
  return { total, raw, parts, cap: limit && raw > limit.limit ? limit : null };
}

export function verdict(total) {
  if (total >= 75) return { name: "Great fit", line: "Flisk was made for teams like yours.", tone: "good" };
  if (total >= 45) return { name: "Could fit", line: "Flisk will help; read the notes below first.", tone: "warn" };
  return { name: "Not a fit yet", line: "Your team does not have the problem Flisk solves, yet.", tone: "bad" };
}

const MARK = { yes: "✅", partly: "🟡", no: "❌" };

export function reasons(runtime, setup, size) {
  const out = [];
  out.push([runtime.mark, runtime.reason]);
  out.push([setup.mark, setup.reason]);
  for (const pain of PAINS) out.push(["yes", pain]);
  if (size.count <= 1) out.push(["no", "One part does not need Flisk. It pays off from about 5 parts."]);
  else if (size.count < 5) out.push(["partly", "A few parts already benefit; Flisk shines from about 5."]);
  else out.push(["yes", "5 or more parts is what Flisk is for. Our tests start 100 small test parts at once (test stubs, not a real app)."]);
  out.push(["yes", `The score assumes a team of ${TEAM} developers. It is simple math on your answers, not measured savings.`]);
  return out;
}

const COLORS = {
  good: ["#1a7f37", "#3fb950"],
  warn: ["#9a6700", "#d29922"],
  bad: ["#cf222e", "#f85149"],
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A ring that fills to the score once when the image loads, with the percentage and the verdict. Light and dark aware;
// with reduced motion, or a viewer without CSS animation, it shows the filled ring.
export function gaugeSvg(total) {
  const v = verdict(total);
  const [light, dark] = COLORS[v.tone];
  const r = 62;
  const c = +(2 * Math.PI * r).toFixed(2);
  const rest = +(c * (1 - total / 100)).toFixed(2);
  const pill = textWidth(v.name, 13, 600) + 24;
  const label = `${total}% fit score: ${v.name}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="196" viewBox="0 0 240 196" role="img" aria-label="${esc(label)}">`,
    `<title>${esc(label)}</title>`,
    `<style>.tr{stroke:#d1d9e0}.ar{stroke:${light}}.n{fill:#1f2328}.m{fill:#59636e}.p{fill:${light}}.pt{fill:#ffffff}` +
      `@media (prefers-color-scheme:dark){.tr{stroke:#3d444d}.ar{stroke:${dark}}.n{fill:#f0f6fc}.m{fill:#9198a1}.p{fill:${dark}}.pt{fill:#0d1117}}` +
      `.ar{stroke-dasharray:${c};stroke-dashoffset:${rest};animation:fill 1.4s cubic-bezier(.2,.7,.2,1) both}` +
      `@keyframes fill{from{stroke-dashoffset:${c}}}` +
      `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`,
    `<circle class="tr" cx="120" cy="84" r="${r}" fill="none" stroke-width="12"/>`,
    `<circle class="ar" cx="120" cy="84" r="${r}" fill="none" stroke-width="12" stroke-linecap="round" transform="rotate(-90 120 84)"/>`,
    `<text class="n" x="120" y="94" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700">${total}%</text>`,
    `<text class="m" x="120" y="114" text-anchor="middle" font-family="${FONT}" font-size="12">fit score</text>`,
    `<rect class="p" x="${120 - pill / 2}" y="164" width="${pill}" height="26" rx="13"/>`,
    `<text class="pt" x="120" y="181.5" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600">${esc(v.name)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

const hashed = (base, svg) => `${base}.${createHash("sha256").update(svg).digest("hex").slice(0, 8)}.svg`;
const pageName = (rt, st, sz) => `${rt.slug}-${st.slug}-${sz.slug}.md`;
export const DEFAULT = { runtime: RUNTIMES[0], setup: SETUPS[2], size: SIZES[2] };

// Everything the calculator produces: images, pages, and the README section.
export function plan() {
  const assets = new Map();
  const image = (base, svg) => {
    const file = `${ASSETS}/${hashed(base, svg)}`;
    assets.set(file, svg);
    return { file, width: Number(/width="(\d+)"/.exec(svg)[1]) };
  };
  const tabImages = new Map();
  for (const [dim, options] of [["runtime", RUNTIMES], ["setup", SETUPS], ["size", SIZES]]) {
    for (const option of options) {
      for (const selected of [false, true]) {
        tabImages.set(`${dim}:${option.slug}:${selected}`, image(`${dim}-${option.slug}${selected ? "-selected" : ""}`, tabSvg(option, selected)));
      }
    }
  }
  const gauges = new Map();
  const gauge = (total) => {
    if (!gauges.has(total)) gauges.set(total, image(`score-${total}`, gaugeSvg(total)));
    return gauges.get(total);
  };

  // The three bars, from the folder of the page that shows them.
  const bars = (from, at) => {
    const rel = (to) => path.posix.relative(from, to);
    const bar = (dim, options, title) => {
      const tabs = options.map((option) => {
        const selected = option.slug === at[dim].slug;
        const pick = { ...at, [dim]: option };
        const img = tabImages.get(`${dim}:${option.slug}:${selected}`);
        const alt = selected ? `${option.label} (selected)` : option.label;
        return `<a href="${rel(`${PAGES}/${pageName(pick.runtime, pick.setup, pick.size)}`)}"><img src="${rel(img.file)}" alt="${esc(alt)}" width="${img.width}" height="48" align="top"></a>`;
      });
      return `<tr><td><sub><b>${title}</b></sub><br>${tabs.join("")}</td></tr>`;
    };
    return [
      "<table>",
      bar("runtime", RUNTIMES, "1. What is the app written in?"),
      bar("setup", SETUPS, "2. How do developers start the app on their laptop today?"),
      bar("size", SIZES, "3. How many parts does the app have? (website, API, background jobs, …)"),
      "</table>",
    ].join("\n");
  };

  const result = (from, at) => {
    const s = score(at.runtime, at.setup, at.size);
    const total = s.total;
    const v = verdict(total);
    const g = gauge(total);
    return {
      total,
      gauge: `<p align="center"><img src="${path.posix.relative(from, g.file)}" alt="${total}% fit score: ${v.name}" width="${g.width}"></p>`,
      verdict: `**${v.name}.** ${v.line}`,
      breakdown: [
        "**How the score adds up**",
        "",
        "| | Your answer | Points |",
        "| --- | --- | --- |",
        ...s.parts.map((part) => `| ${part.name} | ${part.answer} | ${part.points} / ${part.max} |`),
        ...(s.cap ? [`| Sum | | ${s.raw} / 100 |`, `| **Cap** | ${s.cap.why} | **${s.total}** |`] : []),
        `| **Score** | | **${s.total}%** |`,
      ].join("\n"),
    };
  };

  const pages = new Map();
  for (const runtime of RUNTIMES) {
    for (const setup of SETUPS) {
      for (const size of SIZES) {
        const at = { runtime, setup, size };
        const r = result(PAGES, at);
        pages.set(`${PAGES}/${pageName(runtime, setup, size)}`, [
          `<!-- Generated by ${GENERATOR}; edit the generator, not this page. -->`,
          "# Is Flisk right for your team?",
          "",
          "[← Back to the README](../../README.md#is-flisk-right-for-your-team)",
          "",
          `**Your answers:** ${runtime.name} · ${setup.name} · ${size.name}. Click a tab to change one; the score updates.`,
          "",
          bars(PAGES, at),
          "",
          r.gauge,
          "",
          r.verdict,
          "",
          ...reasons(runtime, setup, size).map(([mark, text]) => `- ${MARK[mark]} ${text}`),
          "",
          r.breakdown,
          "",
          "Same math as [flisk.sh/fit](https://flisk.sh/fit/). Two things have no tabs here, so we assumed them (marked \"we assumed\"); change them on the website. The score never says \"great fit\" when a reason above says otherwise.",
          "",
          r.total >= 45 ? "**Next:** [install Flisk](../install/npm.md) and [pick how to start](../../README.md#quick-start)." : "**Next:** [see what Flisk generates](../generated-files.md), or [run your services without Docker](../run-without-docker.md).",
          "",
        ].join("\n"));
      }
    }
  }

  const home = result(".", DEFAULT);
  const section = [
    "<!-- fit · generated by scripts/docs/fit.mjs; edit the generator, not this section -->",
    "Three quick questions; click the answer closest to your team. Not technical? Pick \"not sure\" where you need to. You get a score and a plain-English why.",
    "",
    bars(".", DEFAULT),
    "",
    home.gauge,
    "",
    `${home.verdict} [Why this score →](${PAGES}/${pageName(DEFAULT.runtime, DEFAULT.setup, DEFAULT.size)}) · [Full calculator on flisk.sh](https://flisk.sh/fit/)`,
    "<!-- /fit -->",
  ].join("\n");

  return { assets, pages, section };
}

function filesIn(dir) {
  return existsSync(dir) ? readdirSync(dir).map((name) => path.join(dir, name)) : [];
}

// Returns what is out of date; with write, fixes it first.
export function run(root, { write }) {
  const { assets, pages, section } = plan();
  const stale = [];
  const problems = [];
  const want = new Map([...assets, ...pages]);
  for (const dir of [ASSETS, PAGES]) {
    for (const full of filesIn(path.join(root, dir))) {
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (want.has(rel)) continue;
      stale.push(`${rel}: not produced by ${GENERATOR}`);
      if (write) rmSync(full);
    }
  }
  for (const [rel, content] of want) {
    const full = path.join(root, rel);
    if (existsSync(full) && readFileSync(full, "utf8") === content) continue;
    stale.push(`${rel}: missing or out of date`);
    if (write) {
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
  const readme = path.join(root, "README.md");
  const text = readFileSync(readme, "utf8");
  const match = /<!-- fit[ \n][\s\S]*?<!-- \/fit -->/.exec(text);
  if (!match) problems.push("README.md: no <!-- fit --> ... <!-- /fit --> section");
  else if (match[0] !== section) {
    stale.push("README.md: fit section out of date");
    if (write) writeFileSync(readme, text.replace(match[0], section));
  }
  return { stale, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootAt = args.indexOf("--root");
  const root = path.resolve(rootAt >= 0 ? args[rootAt + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  const check = args.includes("--check");
  const { stale, problems } = run(root, { write: !check });
  for (const line of problems) console.error(`FAIL ${line}`);
  if (check && stale.length > 0) {
    console.error(`${stale.length} generated fit file(s) out of date:\n${stale.slice(0, 20).map((s) => `  ${s}`).join("\n")}`);
    console.error(`Run: node ${GENERATOR}`);
  } else if (!check && stale.length > 0) {
    console.log(`updated ${stale.length} fit file(s)`);
  }
  if (problems.length > 0 || (check && stale.length > 0)) process.exit(1);
  if (check) console.log(`fit calculator up to date (${PAGES}, ${ASSETS})`);
}
