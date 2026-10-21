// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as atomicWrite from "../atomic-write.js";
import * as envValidator from "../env-validator.js";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-env-validator-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writeEnv = (content: string) => writeFileSync(join(root, ".env"), content);
const readEnv = () => readFileSync(join(root, ".env"), "utf-8");
const envValue = (content: string, name: string) => {
  const prefix = `${name}=`;
  const line = content.split("\n").find((l) => l.startsWith(prefix));
  return line?.slice(prefix.length).replace(/\r$/, "");
};

describe("generated project .env", () => {
  it("generates a random JWT secret per project", () => {
    const first = envValidator.generateEnvFile();
    const second = envValidator.generateEnvFile();
    expect(envValue(first, "JWT_SECRET")).toMatch(/^[0-9a-f]{64}$/);
    expect(envValue(first, "JWT_SECRET")).not.toBe(envValue(second, "JWT_SECRET"));
  });

  it("does not require the paid Verdaccio registry", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=x\nJWT_SECRET=y\n");
    expect(envValidator.validateEnvFile(root).missing).toEqual([]);
  });

  it("uses the generated DB_PASSWORD in DATABASE_URL, not a shared literal", () => {
    const content = envValidator.generateEnvFile();
    const password = envValue(content, "DB_PASSWORD");
    expect(password).toMatch(/^[0-9a-f]{32}$/);
    const url = envValue(content, "DATABASE_URL");
    expect(url).toBe(`postgresql://postgres:${password}@postgres:5432/app_dev`);
    expect(url).not.toContain(":postgres@");
  });
});

describe("parseEnv Compose-compatible parsing", () => {
  it("matches the issue cases across BOM and CRLF input", () => {
    const content = [
      "\uFEFFA=1 # inline comment",
      "# whole-line comment",
      'B="x y" # c',
      'E="line\\nbreak"',
      'M="he said \\"hi\\""',
      "export H=1",
      "I = 2",
      "J=",
      "K=first",
      "K=second",
      "L=postgres://u:p=ss@h/db",
      "C='a#b'",
      "D=a#b",
      "Q='line\\nbreak'",
      "S='Let\\'s go!'",
    ].join("\r\n");

    expect([...envValidator.parseEnv(content)]).toEqual([
      ["A", "1"],
      ["B", "x y"],
      ["E", "line\nbreak"],
      ["M", 'he said "hi"'],
      ["H", "1"],
      ["I", "2"],
      ["J", ""],
      ["K", "second"],
      ["L", "postgres://u:p=ss@h/db"],
      ["C", "a#b"],
      ["D", "a#b"],
      ["Q", "line\\nbreak"],
      ["S", "Let's go!"],
    ]);
  });

  it("keeps empty values empty when followed by an inline comment", () => {
    expect([...envValidator.parseEnv("N= # c\nVALUE= foo # c\n")]).toEqual([
      ["N", ""],
      ["VALUE", "foo"],
    ]);
  });

  it("skips malformed assignments without dropping valid neighbours", () => {
    const content = [
      "NO_EQUALS",
      "=orphan",
      "1BAD=1",
      "BAD-NAME=2",
      "GOOD=kept",
      "ALSO_GOOD = spaced",
    ].join("\n");

    expect([...envValidator.parseEnv(content)]).toEqual([
      ["GOOD", "kept"],
      ["ALSO_GOOD", "spaced"],
    ]);
  });

  it("returns an unterminated quoted value verbatim", () => {
    expect(envValidator.parseEnv('VALUE="unterminated').get("VALUE")).toBe('"unterminated');
  });

  it("decodes the specified double-quoted escapes", () => {
    const quote = String.fromCharCode(34);
    const content = [
      "VALUE=",
      quote,
      "line\\nnext\\r\\ttab",
      "\\",
      quote,
      "quote",
      "\\\\",
      "slash",
      "\\$dollar",
      quote,
    ].join("");

    expect(envValidator.parseEnv(content).get("VALUE")).toBe(
      'line\nnext\r\ttab"quote\\slash$dollar',
    );
  });
});

describe("Compose-compatible .env consumers", () => {
  it("does not report a false database password mismatch for an inline comment", () => {
    writeEnv(
      "DB_PASSWORD=abc123 # developer note\nDATABASE_URL=postgresql://postgres:abc123@postgres:5432/app_dev\n",
    );

    expect(envValidator.validateEnvFile(root).warnings).not.toContain(
      "DATABASE_URL carries a different password than DB_PASSWORD; the database container uses DB_PASSWORD",
    );
  });
});

describe("validateEnvFile parsing", () => {
  it("recognises names written with an export prefix", () => {
    writeEnv("export TILT_ENV=dev\nexport DB_PASSWORD=x\nexport JWT_SECRET=y\n");
    expect(envValidator.validateEnvFile(root).missing).toEqual([]);
  });

  it("treats a quoted empty value as empty", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=\"\"\nJWT_SECRET=''\n");
    const { invalid } = envValidator.validateEnvFile(root);
    expect(invalid).toContain("DB_PASSWORD is set but empty");
    expect(invalid).toContain("JWT_SECRET is set but empty");
  });

  it("warns when DATABASE_URL carries a different password than DB_PASSWORD", () => {
    writeEnv(
      "TILT_ENV=dev\nDB_PASSWORD=abc123\nJWT_SECRET=y\nDATABASE_URL=postgresql://postgres:postgres@postgres:5432/app_dev\n",
    );
    expect(envValidator.validateEnvFile(root).warnings.join("\n")).toMatch(
      /DATABASE_URL.*DB_PASSWORD/,
    );
  });

  it("does not warn when DATABASE_URL references a variable", () => {
    writeEnv(
      "TILT_ENV=dev\nDB_PASSWORD=abc123\nJWT_SECRET=y\nDATABASE_URL=postgresql://postgres:$" +
        "{DB_PASSWORD}@postgres:5432/app_dev\n",
    );
    expect(envValidator.validateEnvFile(root).warnings).toEqual([]);
  });

  it("does not warn when DATABASE_URL carries no password", () => {
    writeEnv(
      "TILT_ENV=dev\nDB_PASSWORD=abc123\nJWT_SECRET=y\nDATABASE_URL=postgresql://postgres@postgres:5432/app_dev\n",
    );
    expect(envValidator.validateEnvFile(root).warnings).toEqual([]);
  });
});

describe("completing an existing .env", () => {
  it("appends keys a newer CLI expects without touching existing values", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=keep-this-password\n");
    const added = envValidator.completeEnvFile(root);
    const content = readEnv();
    expect(added).toContain("JWT_SECRET");
    expect(envValue(content, "DB_PASSWORD")).toBe("keep-this-password");
    expect(envValue(content, "TILT_ENV")).toBe("dev");
    expect(envValue(content, "JWT_SECRET")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent and does not rotate a secret it already added", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=keep-this-password\n");
    envValidator.completeEnvFile(root);
    const afterFirst = readEnv();
    expect(envValidator.completeEnvFile(root)).toEqual([]);
    expect(readEnv()).toBe(afterFirst);
  });

  it("creates the file when it is missing", () => {
    expect(existsSync(join(root, ".env"))).toBe(false);
    expect(envValidator.completeEnvFile(root).length).toBeGreaterThan(0);
    expect(envValue(readEnv(), "JWT_SECRET")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("repairs empty generated keys in place and preserves the other file bytes", () => {
    const original = [
      "# keep this comment",
      "TILT_ENV=   # cleared",
      "DB_PASSWORD=keep-this-password",
      "JWT_SECRET=",
      "CUSTOM_VAR=unchanged",
      "",
    ].join("\r\n");
    writeEnv(original);

    const completed = envValidator.completeEnvFile(root);
    const content = readEnv();
    const secret = envValue(content, "JWT_SECRET");

    expect(completed).toEqual(["TILT_ENV", "JWT_SECRET"]);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(content).toBe(
      original
        .replace("TILT_ENV=   # cleared", "TILT_ENV=dev # cleared")
        .replace("JWT_SECRET=", `JWT_SECRET=${secret}`),
    );
  });

  it("leaves the existing file intact when an atomic repair write fails", () => {
    const original = envValidator.generateEnvFile().replace(/^TILT_ENV=.*$/m, "TILT_ENV=");
    writeEnv(original);
    const write = vi.spyOn(atomicWrite, "writeTextFileAtomic").mockImplementation(() => {
      throw new Error("atomic replacement failed");
    });

    try {
      expect(() => envValidator.completeEnvFile(root)).toThrow("atomic replacement failed");
      expect(write).toHaveBeenCalledTimes(1);
      expect(readEnv()).toBe(original);
    } finally {
      write.mockRestore();
    }
  });

  it("repairs an empty database password without changing the database URL", () => {
    const original = [
      "TILT_ENV=dev",
      "DB_PASSWORD=",
      "JWT_SECRET=existing-secret",
      "DATABASE_URL=postgresql://postgres:configured@postgres:5432/app_dev",
      "",
    ].join("\r\n");
    writeEnv(original);

    const completed = envValidator.completeEnvFile(root);
    const content = readEnv();
    const password = envValue(content, "DB_PASSWORD");

    expect(completed).toEqual(["DB_PASSWORD"]);
    expect(password).toMatch(/^[0-9a-f]{32}$/);
    expect(content).toBe(original.replace("DB_PASSWORD=", `DB_PASSWORD=${password}`));
  });

  it("adds a separator when the existing file has no trailing newline", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=keep-this-password");
    const added = envValidator.completeEnvFile(root);
    const content = readEnv();

    expect(added).toEqual(["JWT_SECRET"]);
    expect(
      content.startsWith("TILT_ENV=dev\nDB_PASSWORD=keep-this-password\n\n# Added by Flisk"),
    ).toBe(true);
  });

  it("appends directly after a file ending in a bare carriage return", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=keep-this-password\r");
    const added = envValidator.completeEnvFile(root);
    const content = readEnv();

    expect(added).toEqual(["JWT_SECRET"]);
    expect(
      content.startsWith("TILT_ENV=dev\nDB_PASSWORD=keep-this-password\r\n# Added by Flisk"),
    ).toBe(true);
  });

  it("does not change non-empty generated keys", () => {
    const original = "TILT_ENV=prod\nDB_PASSWORD=keep-this-password\nJWT_SECRET=keep-this-secret\n";
    writeEnv(original);

    expect(envValidator.completeEnvFile(root)).toEqual([]);
    expect(readEnv()).toBe(original);
  });
  it("keeps ensureEnvFile reporting only a newly created file", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=keep-this-password\n");
    expect(envValidator.ensureEnvFile(root)).toBe(false);
    expect(envValue(readEnv(), "DB_PASSWORD")).toBe("keep-this-password");
  });
});

describe("ensureEnvFile", () => {
  it("creates .env and returns true when missing", () => {
    expect(existsSync(join(root, ".env"))).toBe(false);
    expect(envValidator.ensureEnvFile(root)).toBe(true);
    expect(existsSync(join(root, ".env"))).toBe(true);
    expect(readEnv()).toContain("TILT_ENV=dev");
  });

  it("returns false and leaves an existing file untouched", () => {
    const original = "CUSTOM_VAR=custom_val\nTILT_ENV=prod\n";
    writeEnv(original);
    expect(envValidator.ensureEnvFile(root)).toBe(false);
    expect(readEnv()).toBe(original);
  });
});

describe("generateEnvFile", () => {
  it("contains every variable in REQUIRED_ENV_VARS", () => {
    const content = envValidator.generateEnvFile();
    const parsed = envValidator.parseEnv(content);

    const expectedVars = [
      "VERDACCIO_URL_DOCKER",
      "VERDACCIO_URL",
      "TILT_ENV",
      "DATABASE_URL",
      "DB_PASSWORD",
      "JWT_SECRET",
    ];

    for (const name of expectedVars) {
      expect(parsed.has(name)).toBe(true);
      expect(content).toContain(`${name}=`);
    }
  });
});

describe("validateEnvFile coverage", () => {
  it("reports required variables as missing and warning when .env does not exist", () => {
    expect(existsSync(join(root, ".env"))).toBe(false);
    const result = envValidator.validateEnvFile(root);

    expect(result.missing).toContain("TILT_ENV");
    expect(result.missing).toContain("DB_PASSWORD");
    expect(result.missing).not.toContain("VERDACCIO_URL_DOCKER");
    expect(result.invalid).toEqual([]);
    expect(result.warnings).toContain(".env file not found - will be auto-generated");
  });

  it("reports no missing or invalid entries for a complete generated .env", () => {
    const generated = envValidator.generateEnvFile();
    writeEnv(generated);

    const result = envValidator.validateEnvFile(root);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports missing required variables when absent", () => {
    writeEnv("TILT_ENV=dev\n");
    const result = envValidator.validateEnvFile(root);

    expect(result.missing).toEqual(["DB_PASSWORD"]);
    expect(result.invalid).toEqual([]);
  });

  it("reports invalid entry when a variable is set but empty", () => {
    writeEnv("TILT_ENV=dev\nDB_PASSWORD=\n");
    const result = envValidator.validateEnvFile(root);

    expect(result.missing).toEqual([]);
    expect(result.invalid).toContain("DB_PASSWORD is set but empty");
  });

  it("does not count commented lines as set", () => {
    writeEnv("# TILT_ENV=dev\n# DB_PASSWORD=my-secret-password\n");
    const result = envValidator.validateEnvFile(root);

    expect(result.missing).toContain("TILT_ENV");
    expect(result.missing).toContain("DB_PASSWORD");
  });
});
