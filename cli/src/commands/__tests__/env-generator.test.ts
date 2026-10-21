// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { engineFile, evaluateStarlark, tiltAvailable } from "../../test-support/index.js";

const star = (...parts: string[]) => engineFile(...parts);
const envStar = star("topologies", "tilt", "resources", "orchestrator", "generators", "env.star");
const composeStar = star("topologies", "platform", "docker", "compose", "compose.star");
const utilsStar = star("topologies", "tilt", "common", "utils.star");

const hasTilt = tiltAvailable();

const temporaryDirs: string[] = [];

function expectPasses(source: string, env: Record<string, string> = {}) {
  const result = evaluateStarlark(envStar, { args: source, env });
  expect(`${result.stdout}${result.stderr}`, "Starlark check failed").not.toMatch(/Error in fail/);
  expect(result.status, result.stderr).toBe(0);
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** JSON is almost Starlark, but `true`, `false` and `null` are spelled `True`, `False` and `None`. */
function toStarlark(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toStarlark).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${toStarlark(item)}`).join(", ")}}`;
}

const backend = { appType: "backend", stack: "app", port: 4000, appName: "orders-api" };
const withManifest = (extra: Record<string, unknown> = {}) => toStarlark({ ...backend, ...extra });
const composeEntry = (manifest: string) => `
manifest = ${manifest}
manifest['_resource_path'] = 'services/app/orders-api'
entry = generate_backend_compose_entry('services/app', 'orders-api', {'name': 'orders-api', '_resource_path': 'services/app/orders-api'}, manifest)
`;

// Each case spawns `tilt alpha tiltfile-result`, which takes several seconds under full-suite load.
describe.skipIf(!hasTilt)("generated backend .env (env.star)", { timeout: 40_000 }, () => {
  const generate = (manifest: string) =>
    `load(${JSON.stringify(envStar)}, 'EnvGenerators')\nmanifest = ${manifest}\ncontent = EnvGenerators.generate_env_file(manifest)\n`;

  it("defaults to local-jwt auth and never writes the string None", () => {
    expectPasses(`${generate(withManifest())}
if 'AUTH_MODE=local-jwt' not in content: fail('expected AUTH_MODE=local-jwt, got: ' + content)
if 'None' in content: fail('the generated env file contains the string None: ' + content)
`);
  });

  it("keeps a real identity URL in identity-service mode", () => {
    expectPasses(`${generate(withManifest({ dependsOn: ["identity"] }))}
if 'AUTH_MODE=identity-service' not in content: fail('expected identity-service mode: ' + content)
if 'IDENTITY_RESOURCE_URL=http://' not in content: fail('expected an identity URL: ' + content)
if 'None' in content: fail('the generated env file contains the string None: ' + content)
`);
  });

  it("does not write a JWT secret into the generated file, and ignores jwtSecret from service.json", () => {
    // Explicit local-jwt is what reaches the branch that writes JWT_SECRET today; the default case is kept so this stays
    // meaningful once the default itself is local-jwt.
    for (const manifest of [
      withManifest({ authMode: "local-jwt", jwtSecret: "a-real-secret-that-must-not-leak" }),
      withManifest({ jwtSecret: "a-real-secret-that-must-not-leak" }),
    ]) {
      expectPasses(`${generate(manifest)}
if 'JWT_SECRET' in content: fail('JWT_SECRET must not be written to the generated env file: ' + content)
if 'a-real-secret-that-must-not-leak' in content: fail('jwtSecret from service.json was copied: ' + content)
if 'local-development-secret' in content: fail('the shared default JWT secret was written: ' + content)
`);
    }
  });

  it("quotes and escapes param values so the file stays valid dotenv", () => {
    const params = {
      PLAIN: "ok",
      GREETING: "hello world",
      NOTE: "a # b",
      MULTI: "x\ny",
      QUOTE: 'say "hi"',
    };
    expectPasses(`${generate(withManifest({ params }))}
lines = content.split('\\n')
def has(line):
    return line in lines
if not has('PLAIN=ok'): fail('a plain value should stay bare: ' + content)
if not has('GREETING="hello world"'): fail('a value with a space must be quoted: ' + content)
if not has('NOTE="a # b"'): fail('a value with # must be quoted: ' + content)
if not has('MULTI="x\\\\ny"'): fail('a newline must be escaped inside quotes: ' + content)
if not has('QUOTE="say \\\\"hi\\\\""'): fail('inner quotes must be escaped: ' + content)
`);
  });

  it("escapes $ in quoted params so Compose does not interpolate them", () => {
    // Docker Compose expands $NAME and ${NAME} in env files, so a literal dollar must be written as $$. Checked against a real
    // container: "price $$FOO" arrives as the literal price $FOO, and an unescaped $FOO is replaced by someone else's variable.
    const params = { PRICE: "$5", REF: "see $" + "{FOO}", PLAIN: "ok" };
    expectPasses(`${generate(withManifest({ params }))}
lines = content.split('\\n')
def has(line):
    return line in lines
if not has('PRICE="$$5"'): fail('a literal $ must be doubled: ' + content)
if not has('REF="see $\${FOO}"'): fail('a braced variable reference must be doubled so Compose leaves it alone: ' + content)
if not has('PLAIN=ok'): fail('a plain value should stay bare: ' + content)
`);
  });

  it("adds a database URL only when Prisma is opted in", () => {
    expectPasses(`load(${JSON.stringify(envStar)}, 'EnvGenerators')
plain = EnvGenerators.generate_env_file(${withManifest()})
if 'DATABASE_URL' in plain: fail('a backend without prisma got a DATABASE_URL: ' + plain)
with_feature = EnvGenerators.generate_env_file(${withManifest({ featuresEnabled: ["prisma"] })})
if 'DATABASE_URL=' not in with_feature: fail('featuresEnabled prisma should add DATABASE_URL: ' + with_feature)
explicit = EnvGenerators.generate_env_file(${withManifest({ usePrisma: true })})
if 'DATABASE_URL=' not in explicit: fail('usePrisma true should add DATABASE_URL: ' + explicit)
`);
  });

  it("no longer exports the placeholder secrets generator that nothing called", () => {
    expectPasses(`load(${JSON.stringify(envStar)}, 'EnvGenerators')
if hasattr(EnvGenerators, 'generate_secrets_env'): fail('generate_secrets_env is dead code and emits unresolved placeholders')
if hasattr(EnvGenerators, 'get_all_env'): fail('get_all_env is dead code that drops the secrets it builds')
`);
  });
});

describe.skipIf(!hasTilt)("backend Compose entry (compose.star)", { timeout: 40_000 }, () => {
  const load = `load(${JSON.stringify(composeStar)}, 'generate_backend_compose_entry')`;

  it("defaults to local-jwt, not identity-service with a None URL", () => {
    expectPasses(`${load}${composeEntry(withManifest())}
if 'AUTH_MODE=local-jwt' not in entry: fail('expected AUTH_MODE=local-jwt in the compose entry')
if 'None' in entry: fail('the compose entry contains the string None')
`);
  });

  it("takes the JWT secret from the project .env instead of a shared default", () => {
    expectPasses(`${load}${composeEntry(withManifest())}
if 'local-development-secret-min-32-chars-long' in entry: fail('the shared default JWT secret is in the compose entry')
if '- JWT_SECRET=\${JWT_SECRET:?' not in entry: fail('JWT_SECRET must be required from the project .env')
`);
  });

  it("does not require JWT_SECRET in identity-service mode, which does not use it", () => {
    expectPasses(`${load}${composeEntry(withManifest({ dependsOn: ["identity"] }))}
if 'AUTH_MODE=identity-service' not in entry: fail('expected identity-service mode')
if 'JWT_SECRET' in entry: fail('identity-service mode must not require or set JWT_SECRET')
`);
  });

  it("injects secrets.required as required and secrets.optional as optional from the project .env", () => {
    expectPasses(`${load}${composeEntry(withManifest({ secrets: { required: ["STRIPE_KEY"], optional: ["SENTRY_DSN"] } }))}
if '- STRIPE_KEY=\${STRIPE_KEY:?' not in entry: fail('a required secret must fail startup when it is missing')
if '- SENTRY_DSN=\${SENTRY_DSN:-}' not in entry: fail('an optional secret must default to empty')
if 'INFISICAL_SECRET' in entry: fail('unresolved Infisical placeholders must not be emitted')
`);
  });

  it("leaves secrets to Infisical only when TDK_SECRET_PROVIDER=infisical", () => {
    expectPasses(
      `${load}${composeEntry(withManifest({ secrets: { required: ["STRIPE_KEY"] } }))}
if 'STRIPE_KEY=' in entry: fail('with the infisical provider the secret must not be injected from the project .env')
`,
      { TDK_SECRET_PROVIDER: "infisical" },
    );
  });

  it("rejects a secret name that is not a valid environment variable name", () => {
    const result = evaluateStarlark(envStar, {
      args: `${load}${composeEntry(withManifest({ secrets: { required: ["bad name"] } }))}`,
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("bad name");
  });
});

describe.skipIf(!hasTilt)("Infisical on the default path", { timeout: 40_000 }, () => {
  it("does not export the fail-closed Infisical environment check", () => {
    expectPasses(`load(${JSON.stringify(utilsStar)}, 'Utils')
if hasattr(Utils, 'validate_infisical_environment'): fail('validate_infisical_environment fails the Tiltfile when INFISICAL_* is unset, and nothing calls it')
`);
  });
});

describe.skipIf(!hasTilt)("load_dotenv", { timeout: 40_000 }, () => {
  // Parsed in Starlark from the file itself, not by running `cat` through a shell.
  const dotenvDir = (content: string, parent = "tdk-dotenv-") => {
    const dir = mkdtempSync(join(tmpdir(), parent));
    temporaryDirs.push(dir);
    writeFileSync(join(dir, ".env"), content);
    return dir;
  };
  const load = (dir: string) => `load(${JSON.stringify(utilsStar)}, 'Utils')
Utils.load_dotenv(${JSON.stringify(dir)})
def check(name, expected):
    actual = os.environ.get(name, '<unset>')
    if actual != expected: fail(name + ': expected [' + expected + '] but got [' + actual + ']')
`;

  it("reads plain, exported, quoted and empty assignments", () => {
    const dir = dotenvDir(
      [
        "# a comment",
        "",
        "TDK_T_PLAIN=bar",
        "export TDK_T_EXPORTED=baz",
        'TDK_T_DOUBLE="hello world"',
        "TDK_T_SINGLE='a literal $b'",
        'TDK_T_INNER="say \\"hi\\""',
        'TDK_T_EMPTY=""',
        "TDK_T_EQUALS=a=b=c",
        "NOT_AN_ASSIGNMENT",
      ].join("\n"),
    );
    expectPasses(`${load(dir)}
check('TDK_T_PLAIN', 'bar')
check('TDK_T_EXPORTED', 'baz')
if 'export TDK_T_EXPORTED' in os.environ: fail('an export prefix must not become part of the name')
check('TDK_T_DOUBLE', 'hello world')
check('TDK_T_SINGLE', 'a literal $b')
check('TDK_T_INNER', 'say "hi"')
check('TDK_T_EMPTY', '')
check('TDK_T_EQUALS', 'a=b=c')
check('NOT_AN_ASSIGNMENT', '<unset>')
`);
  });

  it("works when the project path contains a single quote", () => {
    const dir = dotenvDir("TDK_T_QUOTED_PATH=found\n", "tdk-dot'env-");
    expectPasses(`${load(dir)}
check('TDK_T_QUOTED_PATH', 'found')
`);
  });

  it("does nothing, without failing, when there is no .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-dotenv-none-"));
    temporaryDirs.push(dir);
    expectPasses(`${load(dir)}
check('TDK_T_NOTHING', '<unset>')
`);
  });
});

describe.skipIf(!hasTilt)(
  "identity service URL is one setting for both writers",
  { timeout: 40_000 },
  () => {
    // The env file (env.star) and the Compose entry (compose.star) used to read different fields, so setting identityServiceUrl
    // changed one and left the other on the built-in default.
    const both = (manifest: string) => `load(${JSON.stringify(envStar)}, 'EnvGenerators')
load(${JSON.stringify(composeStar)}, 'generate_backend_compose_entry')
manifest = ${manifest}
manifest['_resource_path'] = 'services/app/orders-api'
env_file = EnvGenerators.generate_env_file(manifest)
entry = generate_backend_compose_entry('services/app', 'orders-api', {'name': 'orders-api', '_resource_path': 'services/app/orders-api'}, manifest)
`;

    it("uses identityServiceUrl in the env file and in Compose", () => {
      expectPasses(`${both(withManifest({ dependsOn: ["identity"], identityServiceUrl: "http://identity-api:4100" }))}
if 'IDENTITY_RESOURCE_URL=http://identity-api:4100\\n' not in env_file: fail('the env file ignored identityServiceUrl: ' + env_file)
if 'http://identity-api:4100' not in entry: fail('the Compose entry ignored identityServiceUrl')
if 'identity-service:3000' in entry: fail('the Compose entry fell back to the built-in default')
`);
    });

    it("still honours the deprecated envVars.IDENTITY_RESOURCE_URL in both, with identityServiceUrl winning", () => {
      expectPasses(`${both(withManifest({ dependsOn: ["identity"], envVars: { IDENTITY_RESOURCE_URL: "http://legacy-id:4200" } }))}
if 'http://legacy-id:4200' not in entry: fail('the Compose entry lost the deprecated envVars URL')
if 'IDENTITY_RESOURCE_URL=http://legacy-id:4200' not in env_file: fail('the env file ignored the deprecated envVars URL: ' + env_file)
`);
      expectPasses(`${both(withManifest({ dependsOn: ["identity"], identityServiceUrl: "http://new-id:4300", envVars: { IDENTITY_RESOURCE_URL: "http://legacy-id:4200" } }))}
if 'http://new-id:4300' not in entry or 'legacy-id' in entry: fail('identityServiceUrl must win in Compose')
if 'http://new-id:4300' not in env_file: fail('identityServiceUrl must win in the env file')
`);
    });

    it("uses the same built-in default in both when nothing is set", () => {
      expectPasses(`${both(withManifest({ dependsOn: ["identity"] }))}
if 'IDENTITY_RESOURCE_URL=http://' not in env_file: fail('expected a default URL in the env file')
default = env_file.split('IDENTITY_RESOURCE_URL=')[1].split('\\n')[0]
if default not in entry: fail('Compose and the env file use different defaults: ' + default)
`);
    });

    it("detects the auth mode the same way in both (authMode, else an identity dependency, else local-jwt)", () => {
      expectPasses(`${both(withManifest({ authMode: "identity-service" }))}
if 'AUTH_MODE=identity-service' not in env_file or 'AUTH_MODE=identity-service' not in entry: fail('explicit authMode was not honoured by both')
`);
      expectPasses(`${both(withManifest())}
if 'AUTH_MODE=local-jwt' not in env_file or 'AUTH_MODE=local-jwt' not in entry: fail('the default must be local-jwt in both')
`);
    });
  },
);

const debugStar = star("topologies", "tilt", "common", "utils_debug.star");

describe.skipIf(!hasTilt)("Starlark debug logging", () => {
  const source = `load(${JSON.stringify(debugStar)}, 'debug_log')\ndebug_log('TDK_DEBUG_SENTINEL')\n`;

  it("is silent when TDK_DEBUG is disabled and logs when set to 1", () => {
    const normal = evaluateStarlark(debugStar, {
      args: source,
      env: { TDK_DEBUG: "0", TILT_DEBUG: "0" },
      verbose: true,
    });
    expect(normal.status, normal.stderr).toBe(0);
    expect(normal.stdout + normal.stderr).not.toContain("TDK_DEBUG_SENTINEL");

    const debug = evaluateStarlark(debugStar, {
      args: source,
      env: { TDK_DEBUG: "1", TILT_DEBUG: "0" },
      verbose: true,
    });
    expect(debug.status, debug.stderr).toBe(0);
    expect(debug.stdout + debug.stderr).toContain("TDK_DEBUG_SENTINEL");
  });

  it("continues to accept TILT_DEBUG as a legacy alias", () => {
    const debug = evaluateStarlark(debugStar, {
      args: source,
      env: { TDK_DEBUG: "", TILT_DEBUG: "1" },
      verbose: true,
    });
    expect(debug.status, debug.stderr).toBe(0);
    expect(debug.stdout + debug.stderr).toContain("TDK_DEBUG_SENTINEL");
  });
});
