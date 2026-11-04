// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { optionalInfraDefaults } from "../template-engine.js";

const infra = (golden_image: boolean): ProjectConfig["optional_infra"] => ({
  monitoring: false,
  elk: false,
  debezium: false,
  golden_image,
  verdaccio: false,
});

describe("optionalInfraDefaults", () => {
  it('passes "golden_image": false to the toggle the Tiltfile reads, so no golden layers are built', () => {
    // The Tiltfile asks should_enable('golden-image'); the underscore key alone was never read, so a project that set
    // golden_image to false still built eight l1-l4 images (about 2.3 GB) on its first run.
    expect(optionalInfraDefaults(infra(false))).toMatchObject({
      golden_image: false,
      "golden-image": false,
    });
  });

  it("keeps the golden layers on when project.json asks for them", () => {
    expect(optionalInfraDefaults(infra(true))).toMatchObject({ "golden-image": true });
  });

  it("adds nothing when project.json does not set golden_image, so the phase default applies", () => {
    const partial = { monitoring: false } as unknown as ProjectConfig["optional_infra"];
    expect(optionalInfraDefaults(partial)).not.toHaveProperty("golden-image");
  });
});
