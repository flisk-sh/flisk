// Unit tests for the shop benchmark helpers: contract validation, competitor discovery, wiring scan and report.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
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
  // nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag -- fixture text written to a temp file, never rendered
  write(
    bench,
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
