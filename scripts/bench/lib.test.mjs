// Unit tests for the shop benchmark helpers: contract validation, competitor discovery, wiring scan and report.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createMilestoneTracker,
  globToRegex,
  loadCompetitors,
  renderReport,
  scanWiring,
  validateContract,
  writeResults,
} from "./lib.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bench-lib-"));
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
// biome-ignore lint/suspicious/noTemplateCurlyInString: the runner expands ${BENCH_PORT}, it is not a template
const good = {
  id: "x",
  folder: "x",
  name: "X",
  start: "up",
  stop: "down",
  base: "http://localhost:${BENCH_PORT}",
  health: ["http://localhost:${BENCH_PORT}/health"],
};

test("a folder with a bench.json is a competitor, a folder without one is skipped, ids are not hard-coded", () => {
  const root = tmp();
  write(root, "competitors/b-tool/bench.json", JSON.stringify({ ...good, id: "b-tool" }));
  write(root, "competitors/a-tool/bench.json", JSON.stringify({ ...good, id: "a-tool" }));
  write(root, "competitors/stub/README.md", "no contract");
  const found = loadCompetitors(root);
  assert.deepEqual(
    found.map((c) => c.id),
    ["a-tool", "b-tool"],
  );
  assert.equal(found[0].paths.orders, "/api/orders");
});

test("validateContract names every missing field", () => {
  assert.deepEqual(validateContract(good), []);
  const errs = validateContract({ id: "Bad_Id", folder: "other" });
  assert.ok(errs.some((e) => /kebab-case/.test(e)));
  assert.ok(errs.some((e) => /folder name/.test(e)));
  assert.ok(errs.some((e) => /start is required/.test(e)));
  assert.ok(errs.some((e) => /health/.test(e)));
});

test("scanWiring counts hardcoded web ports, secret literals and config lines", () => {
  const bench = tmp();
  write(
    bench, // nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag -- fixture text written to a temp file, never rendered
    "shop/storefront/public/index.html",
    "<script>fetch('http://localhost:4000/api')</script>",
  );
  write(bench, "shop/orders/src/index.ts", "const u = process.env.CATALOG_URL;");
  const work = tmp();
  write(
    work,
    "compose.yaml",
    "services:\n  db:\n    environment:\n      POSTGRES_PASSWORD: shop\n    healthcheck:\n      test: x\n  api:\n    depends_on:\n      db:\n        condition: service_healthy\n",
  );
  const w = scanWiring(work, bench, {
    wiring: {
      configFiles: ["compose.yaml"],
      waitsOnHealthy: "service_healthy",
      healthChecks: "healthcheck",
    },
  });
  assert.equal(w.W1, 1);
  assert.equal(w.W2, 0);
  assert.equal(w.W3, 1);
  assert.equal(w.W4, 1);
  assert.equal(w.W5, 1);
  assert.equal(w.W6, 0);
  assert.equal(w.W7, 10);
});

test("the report is marked informational and skips outcome rows of skipped tools", () => {
  const md = renderReport({
    commit: "abcdef0123456789",
    startedAt: "2026-11-10",
    runner: { os: "Linux", arch: "x64", cpus: 4, memGB: 16, docker: "29", ci: true },
    results: [
      {
        name: "A",
        status: "ok",
        version: "1",
        phases: { firstStartSeconds: 10 },
        checks: { orderShipped: true },
        wiring: { W1: 0, W2: 0, W3: 0, W4: 1, W5: 1, W6: 0, W7: 5 },
      },
      { name: "B", status: "skipped", phases: {}, checks: {}, wiring: null, error: "missing tilt" },
    ],
  });
  assert.match(md, /Informational, not a gate/);
  assert.match(md, /not comparable/);
  assert.match(md, /\| A \| 1 \| ✅ pass \| 10 s/);
  assert.match(md, /\| B \| – \| ⏭️ skipped/);
  assert.equal((md.match(/\| B \|/g) ?? []).length, 1);
});

test("globToRegex: ** spans any depth, * stays inside one folder, dots are literal", () => {
  const re = globToRegex("services/**/service.json");
  assert.ok(re.test("services/a/service.json"));
  assert.ok(re.test("services/shop/a/service.json"));
  assert.ok(re.test("services/service.json"));
  assert.ok(!re.test("services/a/serviceXjson"));
  const one = globToRegex("*.yaml");
  assert.ok(one.test("compose.yaml"));
  assert.ok(!one.test("sub/compose.yaml"));
  assert.ok(globToRegex("a/**").test("a/b/c/d.txt"));
});

test("writeResults leaves a readable results.json and report.md after each call, so partial runs keep finished tools", () => {
  const out = path.join(tmp(), "nested", "out");
  const doc = {
    commit: "abc",
    startedAt: "t",
    runner: { os: "L", arch: "x", cpus: 1, memGB: 1, docker: "1", ci: true },
    results: [],
  };
  writeResults(out, doc);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8")).results.length,
    0,
  );
  doc.results.push({
    name: "A",
    status: "ok",
    phases: { firstStartSeconds: 3 },
    checks: {},
    wiring: null,
  });
  writeResults(out, doc);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8")).results[0].name,
    "A",
  );
  assert.match(fs.readFileSync(path.join(out, "report.md"), "utf8"), /\| A \|/);
});

test("a failed tool shows why and how long it ran", () => {
  const md = renderReport({
    commit: "c",
    startedAt: "t",
    runner: { os: "L", arch: "x", cpus: 1, memGB: 1, docker: "1", ci: true },
    results: [
      {
        name: "F",
        status: "failed",
        phases: {},
        checks: {},
        wiring: null,
        error: "not healthy after 1500s: http://x/",
        failedAfterSeconds: 1503.2,
      },
    ],
  });
  assert.match(md, /\*\*F\*\* \(failed after 1503.2 s\): not healthy after 1500s/);
});

test("validateContract rejects a milestone without a name or with a pattern that is not a regex", () => {
  assert.deepEqual(
    validateContract({ ...good, milestones: [{ name: "engine started", match: "^Running" }] }),
    [],
  );
  const errs = validateContract({
    ...good,
    milestones: [
      { match: "x" },
      { name: "bad", match: "(" },
      { name: "p", match: "x", pick: "middle" },
    ],
  });
  assert.ok(errs.some((e) => /milestones\[0\].*name/.test(e)));
  assert.ok(errs.some((e) => /milestones\[1\].*regular expression/.test(e)));
  assert.ok(errs.some((e) => /milestones\[2\].*first.*last/.test(e)));
  assert.ok(
    validateContract({ ...good, milestones: {} }).some((e) =>
      /milestones must be an array/.test(e),
    ),
  );
});

test("a milestone is timed at its first matching output line, or its last with pick: last, colours ignored", () => {
  const t = createMilestoneTracker([
    { name: "engine started", match: "^Running tilt up" },
    { name: "images built", match: "-image: ready \\(", pick: "last" },
    { name: "never printed", match: "nope" },
  ]);
  t.line("\u001b[32mRunning tilt up...\u001b[0m", 2100);
  t.line("Running tilt up again", 2500);
  t.line("admin-image: ready (4/32 ready)", 6000);
  t.line("orders-image: ready (15/32 ready)", 11940);
  assert.deepEqual(t.snapshot(), [
    { name: "engine started", seconds: 2.1 },
    { name: "images built", seconds: 11.9 },
    { name: "never printed", seconds: null },
  ]);
});

test("a milestone snapshot leaves out lines printed after the stack was healthy", () => {
  const t = createMilestoneTracker([
    { name: "images built", match: "-image: ready", pick: "last" },
  ]);
  t.line("a-image: ready", 3000);
  t.line("b-image: ready", 9000);
  assert.deepEqual(t.snapshot(5000), [{ name: "images built", seconds: 3 }]);
});

test("the report breaks a start down per tool: milestones, then each health URL, for first start and restart", () => {
  const md = renderReport({
    runner: { os: "Linux", arch: "x64", cpus: 4, memGB: 16, docker: "29", ci: true },
    startedAt: "t",
    commit: "abc",
    results: [
      {
        id: "flisk",
        name: "Flisk",
        status: "ok",
        phases: { firstStartSeconds: 58.3, restartSeconds: 27.1 },
        checks: {},
        wiring: null,
        breakdown: {
          firstStart: {
            milestones: [{ name: "engine started", seconds: 4.2 }],
            health: [{ url: "http://api.flisk.localhost:1/api/orders/health", seconds: 51 }],
          },
          restart: {
            milestones: [{ name: "engine started", seconds: 3.9 }],
            health: [{ url: "http://api.flisk.localhost:1/api/orders/health", seconds: null }],
          },
        },
      },
      { id: "old", name: "Old", status: "ok", phases: {}, checks: {}, wiring: null },
    ],
  });
  assert.match(md, /### Where a start spends its time/);
  assert.match(md, /\*\*Flisk\*\*/);
  assert.match(md, /\| engine started \| 4\.2 s \| 3\.9 s \|/);
  assert.match(md, /\| answers: \/api\/orders\/health \| 51 s \| – \|/);
  assert.match(md, /\| healthy \(all URLs answer\) \| 58\.3 s \| 27\.1 s \|/);
  assert.doesNotMatch(md, /\*\*Old\*\*/);
});

test("a report of results without any breakdown has no breakdown section", () => {
  const md = renderReport({
    runner: { os: "Linux", arch: "x64", cpus: 4, memGB: 16, docker: "29", ci: true },
    startedAt: "t",
    commit: "abc",
    results: [{ id: "a", name: "A", status: "ok", phases: {}, checks: {}, wiring: null }],
  });
  assert.doesNotMatch(md, /Where a start spends its time/);
});
