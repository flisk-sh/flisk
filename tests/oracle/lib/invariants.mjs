// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The ORACLE invariants: pure functions over the collected surfaces. Each returns null (the surfaces agree) or a failure in the
// shared bug-memory shape { engine, seed, project, scenario, invariant, expected, actual, surfaces }.
// doctor owns environment/service checks and config verify owns generated-project consistency; ORACLE only compares the
// doctor checks that describe the project (named below), never the Docker/Tilt/host ones.

const dbService = (s) => s.status?.json?.data?.platformServices?.find((p) => p.capability === "database");
const gwService = (s) => s.status?.json?.data?.platformServices?.find((p) => p.capability === "gateway");
const doctorCheck = (s, name) => s.doctor?.json?.data?.checks?.find((c) => c.name === name);
const fail = (invariant, expected, actual, surfaces) => ({ invariant, expected, actual, surfaces });

export const INVARIANTS = [
	{
		id: "surfaces-ran",
		surfaces: ["status", "doctor", "config verify"],
		check: (s) => {
			const bad = ["status", "doctor", "verify"].filter((k) => !s[k]?.json);
			return bad.length ? fail("surfaces-ran", "status, doctor and config verify each print a JSON envelope", `no envelope from: ${bad.join(", ")}${s[bad[0]]?.error ? ` (${s[bad[0]].error})` : ""}`, bad) : null;
		},
	},
	{
		id: "database-need-matches-scenario",
		surfaces: ["status --json platformServices"],
		check: (s, sc) => {
			const db = dbService(s);
			return db && db.isEnabled !== sc.expect.database
				? fail("database-need-matches-scenario", `database ${sc.expect.database ? "enabled" : "disabled"}`, `database ${db.isEnabled ? "enabled" : "disabled"} (${db.reason})`, ["status"])
				: null;
		},
	},
	{
		id: "gateway-need-matches-scenario",
		surfaces: ["status --json platformServices"],
		check: (s, sc) => {
			const gw = gwService(s);
			return gw && gw.isEnabled !== sc.expect.gateway
				? fail("gateway-need-matches-scenario", `gateway ${sc.expect.gateway ? "enabled" : "disabled"}`, `gateway ${gw.isEnabled ? "enabled" : "disabled"} (${gw.reason})`, ["status"])
				: null;
		},
	},
	{
		id: "status-capabilities-match-platform-services",
		surfaces: ["status --json capabilities", "status --json platformServices"],
		check: (s) => {
			const data = s.status?.json?.data;
			if (!data?.platformServices || !data.capabilities) return null;
			const want = data.platformServices.filter((p) => p.isEnabled).map((p) => p.capability).sort();
			const got = [...data.capabilities].sort();
			return want.join() === got.join() ? null : fail("status-capabilities-match-platform-services", `capabilities ${JSON.stringify(want)}`, `capabilities ${JSON.stringify(got)}`, ["status"]);
		},
	},
	{
		id: "verify-postgres-matches-status",
		surfaces: ["config verify --json sharedPlatformPostgres", "status --json platformServices"],
		check: (s) => {
			const db = dbService(s);
			const pg = s.verify?.json?.data?.sharedPlatformPostgres;
			return db && pg && db.isEnabled !== pg.willStart
				? fail("verify-postgres-matches-status", `config verify willStart=${db.isEnabled} like status`, `config verify willStart=${pg.willStart} (reason ${pg.reason}), status database ${db.isEnabled ? "on" : "off"}`, ["verify", "status"])
				: null;
		},
	},
	{
		id: "doctor-postgres-check-matches-status",
		surfaces: ["doctor --json 'Shared platform Postgres'", "status --json platformServices"],
		check: (s) => {
			const db = dbService(s);
			const c = doctorCheck(s, "Shared platform Postgres");
			if (!db || !c) return null;
			return Boolean(c.isSkipped) === db.isEnabled
				? fail("doctor-postgres-check-matches-status", `doctor ${db.isEnabled ? "checks" : "skips"} shared Postgres like status`, `doctor ${c.isSkipped ? "skipped" : "ran"} it: ${c.message}`, ["doctor", "status"])
				: null;
		},
	},
	{
		id: "env-has-database-keys-when-database-on",
		surfaces: [".env", "status --json platformServices"],
		check: (s) => {
			const db = dbService(s);
			if (!db?.isEnabled) return null;
			const { DB_PASSWORD: pw, DATABASE_URL: url } = s.env;
			if (!pw) return fail("env-has-database-keys-when-database-on", "DB_PASSWORD in .env", "status enables PostgreSQL but .env has no DB_PASSWORD", ["env", "status"]);
			if (!url?.includes(pw)) return fail("env-has-database-keys-when-database-on", "DATABASE_URL built from DB_PASSWORD", "DATABASE_URL does not contain DB_PASSWORD", ["env"]);
			return null;
		},
	},
	{
		id: "env-has-jwt-secret",
		surfaces: [".env"],
		check: (s) => (s.env.JWT_SECRET ? null : fail("env-has-jwt-secret", "JWT_SECRET in .env (local-jwt is the default auth mode)", "JWT_SECRET missing", ["env"])),
	},
	{
		id: "doctor-env-agrees-with-dotenv",
		surfaces: ["doctor --json 'Environment Variables'", ".env"],
		check: (s) => {
			const c = doctorCheck(s, "Environment Variables");
			if (!c || c.didPass) return null;
			const present = Object.keys(s.env).filter((k) => s.env[k] !== "" && new RegExp(`\\b${k}\\b`).test(c.message ?? ""));
			return present.length ? fail("doctor-env-agrees-with-dotenv", "doctor reports only keys missing from .env", `doctor reports ${present.join(", ")} missing, but .env sets them`, ["doctor", "env"]) : null;
		},
	},
	{
		id: "generated-files-consistent",
		surfaces: ["config verify --json valid", "doctor --json 'Master Configs'"],
		check: (s) => {
			// doctor's Master Configs only checks that the files exist; config verify checks they match project.json. A project that
			// verifies clean after regenerate must have them, and a doctor that finds them missing cannot sit beside a clean verify.
			const c = doctorCheck(s, "Master Configs");
			const v = s.verify?.json?.data;
			if (!v) return null;
			if (!v.valid) return fail("generated-files-consistent", "config verify valid after config regenerate", `config verify errors: ${(v.errors ?? []).join("; ")}`, ["verify"]);
			return c && !c.didPass ? fail("generated-files-consistent", "doctor finds the master files config verify accepted", `doctor Master Configs failed: ${c.message}`, ["doctor", "verify"]) : null;
		},
	},
	{
		id: "status-lists-scaffolded-resources",
		surfaces: ["status --json resources", "scaffold output"],
		check: (s, sc) => {
			const listed = s.status?.json?.data?.resources;
			if (!listed) return null;
			const want = sc.resources.map((r) => `${r.name}=${r.kind}`).sort();
			const got = listed.map((r) => `${r.name}=${r.type}`).sort();
			return want.join() === got.join() ? null : fail("status-lists-scaffolded-resources", `resources ${want.join(" ")}`, `resources ${got.join(" ")}`, ["status"]);
		},
	},
	{
		id: "compose-matches-database-need",
		surfaces: ["export compose --dry-run", "status --json platformServices"],
		check: (s, sc) => {
			if (s.compose?.code !== 0 || !s.compose.text.includes("services:")) return null; // no bring-your-own resource: nothing to compare
			const db = dbService(s);
			const services = [...s.compose.text.matchAll(/^ {2}([A-Za-z0-9_.-]+):\s*$/gm)].map((m) => m[1]);
			const byo = sc.resources.filter((r) => r.kind === "bring-your-own").map((r) => r.name).sort();
			const missing = byo.filter((n) => !services.includes(n));
			if (missing.length) return fail("compose-matches-database-need", `compose lists ${byo.join(", ")}`, `compose is missing ${missing.join(", ")}`, ["compose"]);
			if (db && !db.isEnabled && (services.includes("postgres") || /DB_PASSWORD/.test(s.compose.text))) {
				return fail("compose-matches-database-need", "no PostgreSQL service or DB_PASSWORD in compose while the database is off", "compose still references the database", ["compose", "status"]);
			}
			return null;
		},
	},
];

// Run every invariant. Returns failures in the bug-memory shape, with the engine/seed/scenario fields filled in.
export function checkScenario(surfaces, scenario, { project = "generated-project" } = {}) {
	const failures = [];
	for (const inv of INVARIANTS) {
		const f = inv.check(surfaces, scenario);
		if (f) failures.push({ engine: "ORACLE", seed: scenario.seed, project, scenario: scenario.shape, ...f, reproduction: `node tests/oracle/run.mjs --seed ${scenario.seed} --shape ${scenario.shape}`, regression_test: "pending" });
	}
	return failures;
}
