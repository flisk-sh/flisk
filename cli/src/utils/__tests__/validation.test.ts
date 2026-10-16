// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { VALID_RESOURCE_TYPES } from "../constants.js";
import {
  createKebabCaseValidator,
  includes,
  isPathSafe,
  isValidPort,
  sanitizeForShell,
  validateOptionalInfraService,
  validateResourceName,
  validateStackName,
} from "../validation.js";

describe("validateResourceName", () => {
  it("should validate correct kebab-case names", () => {
    expect(validateResourceName("my-service")).toEqual({ valid: true });
    expect(validateResourceName("service123")).toEqual({ valid: true });
    expect(validateResourceName("api-gateway")).toEqual({ valid: true });
    expect(validateResourceName("a")).toEqual({ valid: true });
    expect(validateResourceName("test-123-abc")).toEqual({ valid: true });
  });

  it("should reject empty names", () => {
    const result = validateResourceName("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("should reject whitespace-only names", () => {
    const result = validateResourceName("   ");
    expect(result.valid).toBe(false);
  });

  it("should reject camelCase", () => {
    expect(validateResourceName("myService").valid).toBe(false);
  });

  it("should reject underscores", () => {
    expect(validateResourceName("my_service").valid).toBe(false);
  });

  it("should reject uppercase letters", () => {
    expect(validateResourceName("My-Service").valid).toBe(false);
  });

  it("should reject spaces", () => {
    expect(validateResourceName("my service").valid).toBe(false);
  });

  it("should reject dots", () => {
    expect(validateResourceName("my.service").valid).toBe(false);
  });
});

describe("createKebabCaseValidator", () => {
  it("should return true for valid resource names", () => {
    const validator = createKebabCaseValidator("resource");
    expect(validator("my-resource")).toBe(true);
  });

  it("should return error for empty resource name", () => {
    const validator = createKebabCaseValidator("resource");
    expect(validator("")).toBe("Resource name is required");
  });

  it("should return error for invalid resource name", () => {
    const validator = createKebabCaseValidator("resource");
    expect(validator("MyResource")).toBe(
      'Resource name "MyResource" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-service".',
    );
  });

  it("should return error for empty stack name", () => {
    const validator = createKebabCaseValidator("stack");
    expect(validator("")).toBe("Stack name is required");
  });

  it("should return error for invalid stack name", () => {
    const validator = createKebabCaseValidator("stack");
    expect(validator("MyStack")).toBe(
      'Stack name "MyStack" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-stack".',
    );
  });
});

describe("validateStackName", () => {
  it("accepts kebab-case names", () => {
    expect(validateStackName("my-stack")).toEqual({ valid: true });
    expect(validateStackName("shop2")).toEqual({ valid: true });
  });

  it("rejects spaces and capitals, naming the value and giving an example", () => {
    expect(validateStackName("Bad Stack")).toEqual({
      valid: false,
      error:
        'Stack name "Bad Stack" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-stack".',
    });
    expect(validateStackName("a/b").valid).toBe(false);
  });

  it("requires a name", () => {
    expect(validateStackName("  ")).toEqual({ valid: false, error: "Stack name is required" });
  });
});

describe("validateOptionalInfraService", () => {
  it("should accept valid infra services", () => {
    expect(validateOptionalInfraService("monitoring").valid).toBe(true);
    expect(validateOptionalInfraService("elk").valid).toBe(true);
    expect(validateOptionalInfraService("debezium").valid).toBe(true);
    expect(validateOptionalInfraService("golden_image").valid).toBe(true);
  });

  it("should reject invalid infra services", () => {
    const result = validateOptionalInfraService("redis");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid service");
  });

  it("should reject empty string", () => {
    expect(validateOptionalInfraService("").valid).toBe(false);
  });
});

describe("isValidPort", () => {
  it("should accept valid ports", () => {
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(1024)).toBe(true);
    expect(isValidPort(3000)).toBe(true);
    expect(isValidPort(8080)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });

  it("should reject port 0", () => {
    expect(isValidPort(0)).toBe(false);
  });

  it("should reject negative ports", () => {
    expect(isValidPort(-1)).toBe(false);
  });

  it("should reject ports > 65535", () => {
    expect(isValidPort(65536)).toBe(false);
  });

  it("should reject NaN", () => {
    expect(isValidPort(NaN)).toBe(false);
  });

  it("should reject non-integer ports", () => {
    expect(isValidPort(80.5)).toBe(false);
  });
});

describe("sanitizeForShell", () => {
  it("should replace special characters", () => {
    expect(sanitizeForShell("hello$world")).toBe("hello_world");
  });

  it("should keep alphanumeric and hyphens", () => {
    expect(sanitizeForShell("my-service-123")).toBe("my-service-123");
  });

  it("should limit output to 100 chars", () => {
    const long = "a".repeat(200);
    expect(sanitizeForShell(long).length).toBe(100);
  });
});

describe("isPathSafe", () => {
  it("accepts ordinary names and relative paths", () => {
    expect(isPathSafe("my-service")).toBe(true);
    expect(isPathSafe("a/b")).toBe(true);
  });

  it.each(["\0", "<", ">", ":", '"', "|", "?", "*"])(
    "rejects unsafe path character %j",
    (character) => {
      expect(isPathSafe(character)).toBe(false);
    },
  );
});

describe("includes", () => {
  const resourceTypes = ["backend", "worker"] as const;

  it("returns true for a member and false for a non-member", () => {
    expect(includes(resourceTypes, "backend")).toBe(true);
    expect(includes(resourceTypes, "frontend")).toBe(false);
  });

  it("narrows a string to the readonly array's element type", () => {
    const candidate: string = "worker";
    if (!includes(resourceTypes, candidate)) {
      throw new Error("Expected candidate to be a resource type");
    }

    const narrowed: (typeof resourceTypes)[number] = candidate;
    expect(narrowed).toBe("worker");
  });
});

describe("VALID_RESOURCE_TYPES", () => {
  it("should include all expected types", () => {
    const expected = [
      "backend",
      "frontend",
      "library",
      "sdk",
      "worker",
      "migrator",
      "mcp",
      "agent",
      "bring-your-own",
    ];
    expect(VALID_RESOURCE_TYPES.sort()).toEqual(expected.sort());
  });
});
