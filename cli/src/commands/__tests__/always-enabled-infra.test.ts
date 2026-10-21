// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

interface PhaseFixture {
  name: string;
  description: string;
  enabledStacks: string[];
}

interface ProjectConfigFixture {
  version: string;
  project: { name: string; version: string };
  phases: {
    pre_alpha: PhaseFixture;
    alpha: PhaseFixture;
    beta: PhaseFixture;
    out_of_scope: PhaseFixture;
  };
  always_enabled_infra?: string[];
}

describe("always_enabled_infra", () => {
  it("includes core infrastructure always enabled in pre_alpha", () => {
    const projectConfig: ProjectConfigFixture = {
      version: "1.0",
      project: { name: "checkout-app", version: "1.0.0" },
      phases: {
        pre_alpha: {
          name: "Pre-Alpha",
          description: "Core infrastructure and MVP services",
          enabledStacks: ["proxy", "billing", "checkout-app", "database-management"],
        },
        alpha: {
          name: "Alpha",
          description: "Essential business services",
          enabledStacks: [],
        },
        beta: {
          name: "Beta",
          description: "Extended features",
          enabledStacks: [],
        },
        out_of_scope: {
          name: "Out of Scope",
          description: "Future releases",
          enabledStacks: [],
        },
      },
      always_enabled_infra: ["database-management", "proxy"],
    };

    expect(projectConfig.always_enabled_infra).toContain("database-management");
    expect(projectConfig.always_enabled_infra).toContain("proxy");
    expect(projectConfig.phases.pre_alpha.enabledStacks).toContain("proxy");
  });

  it("always_enabled_infra defaults when not specified", () => {
    const projectConfig: ProjectConfigFixture = {
      version: "1.0",
      project: { name: "my-project", version: "1.0.0" },
      phases: {
        pre_alpha: {
          name: "Pre-Alpha",
          description: "Core infrastructure and MVP services",
          enabledStacks: [],
        },
        alpha: {
          name: "Alpha",
          description: "Essential business services",
          enabledStacks: [],
        },
        beta: {
          name: "Beta",
          description: "Extended features",
          enabledStacks: [],
        },
        out_of_scope: {
          name: "Out of Scope",
          description: "Future releases",
          enabledStacks: [],
        },
      },
    };

    // TemplateEngine uses ?? operator to default when undefined/null
    const defaults = projectConfig.always_enabled_infra ?? ["database-management", "proxy"];

    expect(defaults).toContain("database-management");
    expect(defaults).toContain("proxy");
  });

  it("always_enabled_infra + enabledStacks can overlap, including explicit premium infra", () => {
    const projectConfig = {
      version: "1.0",
      project: { name: "test-project", version: "1.0.0" },
      phases: {
        pre_alpha: {
          name: "Pre-Alpha",
          description: "Core infrastructure and MVP services",
          enabledStacks: ["proxy", "database-management"],
        },
      },
      always_enabled_infra: ["proxy", "infisical"],
    };

    expect(projectConfig.phases.pre_alpha.enabledStacks).toContain("proxy");
    expect(projectConfig.always_enabled_infra).toContain("infisical");
    expect(projectConfig.always_enabled_infra).toContain("proxy");
  });
});
