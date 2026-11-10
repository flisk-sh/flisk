// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { tiltAnswerIsForeign } from "../tilt-answer-owner.js";

describe("tiltAnswerIsForeign", () => {
  const projectResourceNames = new Set(["api"]);

  it.each([null, "not an answer", {}, { items: "nope" }])(
    "treats an unparseable answer as inconclusive: %j",
    (resources) => {
      expect(tiltAnswerIsForeign(resources, projectResourceNames)).toBe(false);
    },
  );

  it("treats an empty resource list as inconclusive", () => {
    expect(tiltAnswerIsForeign({ items: [] }, projectResourceNames)).toBe(false);
  });

  it("recognizes a project resource", () => {
    expect(
      tiltAnswerIsForeign({ items: [{ metadata: { name: "api" } }] }, projectResourceNames),
    ).toBe(false);
  });

  it("lets a project resource win over a foreign resource", () => {
    expect(
      tiltAnswerIsForeign(
        { items: [{ metadata: { name: "other" } }, { metadata: { name: "api" } }] },
        projectResourceNames,
      ),
    ).toBe(false);
  });

  it("treats platform-only resources as inconclusive", () => {
    expect(
      tiltAnswerIsForeign(
        {
          items: [
            { metadata: { name: "traefik" } },
            { metadata: { name: "service-discovery-daemon" } },
            { metadata: { name: "(Tiltfile)" } },
          ],
        },
        projectResourceNames,
      ),
    ).toBe(false);
  });

  it("treats malformed items as inconclusive", () => {
    expect(
      tiltAnswerIsForeign({ items: [null, {}, { metadata: { name: 42 } }] }, projectResourceNames),
    ).toBe(false);
  });

  it("detects a foreign resource", () => {
    expect(
      tiltAnswerIsForeign({ items: [{ metadata: { name: "other" } }] }, projectResourceNames),
    ).toBe(true);
  });

  it("detects a foreign resource alongside a platform resource", () => {
    expect(
      tiltAnswerIsForeign(
        { items: [{ metadata: { name: "traefik" } }, { metadata: { name: "other" } }] },
        projectResourceNames,
      ),
    ).toBe(true);
  });
});
