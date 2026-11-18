// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: these strings are env references for expandEnvValue, not templates
import { describe, expect, it, vi } from "vitest";
import { expandEnvValue } from "../env-expand.js";

describe("expandEnvValue", () => {
  it("substitutes a known variable", () => {
    expect(expandEnvValue("http://${HOST}:8080", { HOST: "localhost" })).toBe(
      "http://localhost:8080",
    );
  });

  it("expands an unknown variable without a default to an empty string and reports it", () => {
    const onMissing = vi.fn();

    expect(expandEnvValue("a${MISSING}b", {}, onMissing)).toBe("ab");
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onMissing).toHaveBeenCalledWith("MISSING");
  });

  it("reports an unknown variable once per occurrence", () => {
    const onMissing = vi.fn();

    expect(expandEnvValue("${MISSING}/${MISSING}", {}, onMissing)).toBe("/");
    expect(onMissing).toHaveBeenCalledTimes(2);
  });

  it("uses the default for an unknown variable without reporting it", () => {
    const onMissing = vi.fn();

    expect(expandEnvValue("${PORT:-3000}", {}, onMissing)).toBe("3000");
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("uses the default for a variable set to an empty string", () => {
    expect(expandEnvValue("${PORT:-3000}", { PORT: "" })).toBe("3000");
  });

  it("allows an empty default", () => {
    const onMissing = vi.fn();

    expect(expandEnvValue("x${PORT:-}y", {}, onMissing)).toBe("xy");
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("prefers a set variable over its default", () => {
    expect(expandEnvValue("${PORT:-3000}", { PORT: "4000" })).toBe("4000");
  });

  it("expands several variables in one string", () => {
    expect(expandEnvValue("${USER}@${HOST:-db}:${PORT}", { USER: "app", PORT: "5432" })).toBe(
      "app@db:5432",
    );
  });

  it("leaves a name that is not a valid identifier as is", () => {
    const onMissing = vi.fn();

    expect(expandEnvValue("${1ABC} ${A-B} $HOST ${}", { HOST: "h", "1ABC": "x" }, onMissing)).toBe(
      "${1ABC} ${A-B} $HOST ${}",
    );
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("returns text without a reference untouched", () => {
    expect(expandEnvValue("plain value", { plain: "x" })).toBe("plain value");
  });

  it("does not expand a value that a variable brings in", () => {
    expect(expandEnvValue("${A}", { A: "${B}", B: "nested" })).toBe("${B}");
  });
});
