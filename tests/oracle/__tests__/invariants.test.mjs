// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { INVARIANTS, checkScenario } from "../lib/invariants.mjs";

const scenario = { seed: 5, shape: "byo-only", resources: [{ name: "w", kind: "bring-your-own" }], expect: { database: false, gateway: true } };
const services = (db, gw = true) => [
	{ capability: "gateway", isEnabled: gw, reason: "gw" },
	{ capability: "database", isEnabled: db, reason: db ? "on" : "off" },
];
// A project every surface agrees on: BYO only, no database.
const agreeing = () => ({
	verify: { json: { data: { valid: true, errors: [], sharedPlatformPostgres: { willStart: false, reason: "none" } } } },
	status: { json: { data: { capabilities: ["gateway"], platformServices: services(false), resources: [{ name: "w", type: "bring-your-own" }] } } },
	doctor: { json: { data: { checks: [
		{ name: "Shared platform Postgres", didPass: true, isSkipped: true, message: "skipped" },
		{ name: "Environment Variables", didPass: true, message: "ok" },
		{ name: "Master Configs", didPass: true, message: "found" },
	] } } },
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
	const sc = { ...scenario, expect: { database: true, gateway: true } };
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
