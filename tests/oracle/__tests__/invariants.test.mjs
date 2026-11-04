// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { INVARIANTS, checkScenario } from "../lib/invariants.mjs";

const scenario = { seed: 5, shape: "byo-only", resources: [{ name: "w", kind: "bring-your-own", stack: "main" }], expect: { database: false, gateway: true, cycle: false, dangling: false } };
const services = (db, gw = true) => [
	{ capability: "gateway", isEnabled: gw, reason: "gw" },
	{ capability: "database", isEnabled: db, reason: db ? "on" : "off" },
];
// A project every surface agrees on: BYO only, no database.
const agreeing = () => ({
	verify: { json: { data: { valid: true, errors: [], sharedPlatformPostgres: { willStart: false, reason: "none" } } } },
	status: { json: { data: { stacks: [{ name: "main", resourceCount: 1, resources: ["w"] }], capabilities: ["gateway"], platformServices: services(false), resources: [{ name: "w", type: "bring-your-own" }] } } },
	doctor: { json: { data: { checks: [
		{ name: "Shared platform Postgres", didPass: true, isSkipped: true, message: "skipped" },
		{ name: "Environment Variables", didPass: true, message: "ok" },
		{ name: "Master Configs", didPass: true, message: "found" },
		{ name: "Circular dependencies", didPass: true, message: "none" },
	] } } },
	stacks: { json: { data: { stacks: [{ name: "main", resourceCount: 1 }] } } },
	up: { code: 0, json: { data: { ok: true, unknownDependsOn: [] } } },
	projectJson: { optional_infra: {} },
	specMaster: null,
	staleVerify: null,
	compose: { code: 0, text: "name: main\n\nservices:\n  w:\n    init: true\n" },
	env: { JWT_SECRET: "s", DB_PASSWORD: "pw", DATABASE_URL: "postgres://u:pw@h/db" },
});
const ids = (s, sc = scenario) => checkScenario(s, sc).map((f) => f.invariant);

test("surfaces that agree produce no failure", () => assert.deepEqual(ids(agreeing()), []));

test("every invariant is exercised below and has an id and surfaces", () => {
	for (const inv of INVARIANTS) assert.ok(inv.id && inv.surfaces.length > 0, inv.id);
	assert.equal(new Set(INVARIANTS.map((i) => i.id)).size, INVARIANTS.length);
});

test("status enabling PostgreSQL for a project that needs none is a contradiction", () => {
	const s = agreeing();
	s.status.json.data.platformServices = services(true);
	s.status.json.data.capabilities = ["gateway", "database"];
	assert.ok(ids(s).includes("database-need-matches-scenario"));
});

test("config verify and status disagreeing about PostgreSQL is flagged", () => {
	const s = agreeing();
	s.verify.json.data.sharedPlatformPostgres.willStart = true;
	assert.deepEqual(ids(s), ["verify-postgres-matches-status"]);
});

test("capabilities that do not list an enabled platform service are flagged", () => {
	const s = agreeing();
	s.status.json.data.capabilities = [];
	assert.deepEqual(ids(s), ["status-capabilities-match-platform-services"]);
});

test("doctor running the Postgres check while the database is off is flagged", () => {
	const s = agreeing();
	s.doctor.json.data.checks[0].isSkipped = false;
	assert.deepEqual(ids(s), ["doctor-postgres-check-matches-status"]);
});

test("database on needs DB_PASSWORD in .env and DATABASE_URL built from it", () => {
	const sc = { ...scenario, expect: { database: true, gateway: true, cycle: false, dangling: false } };
	const s = agreeing();
	s.status.json.data.platformServices = services(true);
	s.status.json.data.capabilities = ["gateway", "database"];
	s.verify.json.data.sharedPlatformPostgres.willStart = true;
	s.doctor.json.data.checks[0].isSkipped = false;
	assert.deepEqual(ids(s, sc), []);
	delete s.env.DB_PASSWORD;
	assert.deepEqual(ids(s, sc), ["env-has-database-keys-when-database-on"]);
	s.env.DB_PASSWORD = "pw";
	s.env.DATABASE_URL = "postgres://u:other@h/db";
	assert.deepEqual(ids(s, sc), ["env-has-database-keys-when-database-on"]);
});

test("doctor reporting a key missing that .env sets is flagged; a truly missing key is not", () => {
	const s = agreeing();
	s.doctor.json.data.checks[1] = { name: "Environment Variables", didPass: false, message: "Missing: DB_PASSWORD" };
	assert.deepEqual(ids(s), ["doctor-env-agrees-with-dotenv"]);
	delete s.env.DB_PASSWORD;
	assert.deepEqual(ids(s), []);
});

test("a missing JWT_SECRET is flagged", () => {
	const s = agreeing();
	s.env.JWT_SECRET = "";
	assert.deepEqual(ids(s), ["env-has-jwt-secret"]);
});

test("config verify out of sync, or doctor missing files verify accepted, is flagged", () => {
	const s = agreeing();
	s.verify.json.data.valid = false;
	s.verify.json.data.errors = ["Out of sync: spec.master"];
	assert.deepEqual(ids(s), ["generated-files-consistent"]);
	s.verify.json.data.valid = true;
	s.doctor.json.data.checks[2].didPass = false;
	assert.deepEqual(ids(s), ["generated-files-consistent"]);
});

test("status resources that differ from what was scaffolded are flagged", () => {
	const s = agreeing();
	s.status.json.data.resources = [];
	assert.deepEqual(ids(s), ["status-lists-scaffolded-resources"]);
});

test("generated compose that still references the database the platform dropped is flagged", () => {
	const s = agreeing();
	s.compose.text += "  postgres:\n    image: postgres\n";
	assert.deepEqual(ids(s), ["compose-matches-database-need"]);
	s.compose.text = "services:\n  other:\n";
	assert.deepEqual(ids(s), ["compose-matches-database-need"]);
});

test("a command with no JSON envelope is itself a failure", () => {
	const s = agreeing();
	s.doctor = { code: 1, error: "no JSON envelope" };
	assert.ok(ids(s).includes("surfaces-ran"));
});

test("a failure carries the bug-memory fields and a replay command", () => {
	const s = agreeing();
	s.env.JWT_SECRET = "";
	const [f] = checkScenario(s, scenario, { project: "p" });
	assert.equal(f.engine, "ORACLE");
	assert.equal(f.seed, 5);
	assert.equal(f.scenario, "byo-only");
	assert.equal(f.regression_test, "pending");
	assert.equal(f.reproduction, "node tests/oracle/run.mjs --seed 5 --shape byo-only");
});

test("flisk stacks and status disagreeing about a stack is flagged", () => {
	const s = agreeing();
	s.stacks.json.data.stacks = [{ name: "main", resourceCount: 2 }];
	assert.deepEqual(ids(s), ["stacks-command-matches-status"]);
});

test("status putting a resource on the wrong stack is flagged", () => {
	const s = agreeing();
	s.status.json.data.stacks = [{ name: "other", resourceCount: 1, resources: ["w"] }];
	s.stacks.json.data.stacks = [{ name: "other", resourceCount: 1 }];
	assert.deepEqual(ids(s), ["status-stacks-match-scenario"]);
});

test("optional infra: project.json, spec.master and the stale verify must agree with what was toggled", () => {
	const sc = { ...scenario, infra: { monitoring: true, golden_image: true } };
	const s = agreeing();
	s.projectJson.optional_infra = { monitoring: true, golden_image: true };
	s.specMaster = '"monitoring": True, # x\n"golden_image": True, # y\n';
	s.staleVerify = { json: { data: { valid: false } } };
	assert.deepEqual(ids(s, sc), []);
	s.specMaster = '"monitoring": False, # x\n';
	assert.deepEqual(ids(s, sc), ["infra-flags-agree"]);
	s.specMaster = '"monitoring": True, # x\n';
	s.projectJson.optional_infra.monitoring = false;
	assert.deepEqual(ids(s, sc), ["infra-flags-agree"]);
	s.projectJson.optional_infra.monitoring = true;
	s.staleVerify = { json: { data: { valid: true } } };
	assert.deepEqual(ids(s, sc), ["verify-notices-unapplied-infra"]);
	s.staleVerify = { json: { data: { valid: true } } };
	assert.deepEqual(ids(s, { ...sc, infra: { monitoring: false, golden_image: true } }).filter((i) => i === "verify-notices-unapplied-infra"), [], "defaults change nothing");
});

test("a dependsOn cycle must be seen by verify, doctor and up alike", () => {
	const sc = { ...scenario, expect: { ...scenario.expect, cycle: true } };
	const s = agreeing();
	assert.deepEqual(ids(s, sc), ["dependson-graph-agrees"], "nobody noticed the cycle");
	s.verify.json.data = { valid: false, errors: ["1 circular dependency:\n a -> b -> a"], sharedPlatformPostgres: { willStart: false, unknownDependsOnNames: [] } };
	s.doctor.json.data.checks[3] = { name: "Circular dependencies", didPass: false, message: "a -> b -> a" };
	s.up = { code: 1, json: { data: { ok: false } } };
	assert.deepEqual(ids(s, sc), []);
	s.up = { code: 0, json: { data: { ok: true } } };
	assert.deepEqual(ids(s, sc), ["dependson-graph-agrees"], "up accepted a cycle verify refuses");
});

test("a dangling dependsOn must be named by both verify and up --dry-run", () => {
	const sc = { ...scenario, expect: { ...scenario.expect, dangling: true } };
	const s = agreeing();
	s.verify.json.data = { valid: false, errors: ["dependsOn ghost"], sharedPlatformPostgres: { willStart: false, unknownDependsOnNames: [{ resource: "w", name: "ghost" }] } };
	s.up.json.data.unknownDependsOn = [{ resource: "w", name: "ghost" }];
	assert.deepEqual(ids(s, sc), []);
	s.up.json.data.unknownDependsOn = [];
	assert.deepEqual(ids(s, sc), ["dependson-graph-agrees"]);
});
