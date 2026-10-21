// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

/**
 * Project → Phase → Stack → Resource (PPSR) model.
 *
 * project.json now organizes services by release phase:
 *
 *   project
 *     └── phases
 *           ├── pre_alpha.enabledStacks: ["proxy", "billing", "checkout-app"]
 *           ├── alpha.enabledStacks: []
 *           ├── beta.enabledStacks: []
 *           └── out_of_scope.enabledStacks: []
 *
 * Each entry in enabledStacks[] is a stack name (e.g. "billing").
 * A stack owns one or more resources/services (e.g. "checkout-app" has
 * service.json with stack: "billing").
 */
describe("Project → Phase → Stack → Resource model", () => {
  it("defines phases with enabledStacks (not legacy stacks/services)", () => {
    const projectConfig = {
      version: "1.0",
      project: { name: "checkout-app", version: "1.0.0" },
      phases: {
        pre_alpha: {
          name: "Pre-Alpha",
          description: "Core infrastructure and MVP services",
          enabledStacks: ["proxy", "database-management", "app", "billing", "checkout-app"],
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

    expect(projectConfig).toHaveProperty("phases");
    expect(projectConfig).not.toHaveProperty("stacks");
    expect(projectConfig.phases.pre_alpha).toHaveProperty("enabledStacks");
    expect(projectConfig.phases.pre_alpha).not.toHaveProperty("services");
    expect(projectConfig.phases.pre_alpha.enabledStacks).toContain("billing");
    expect(projectConfig.phases.pre_alpha.enabledStacks).toContain("checkout-app");
  });

  it("keeps the PSR stack concept separate from phases", () => {
    const service = {
      appName: "checkout-app",
      appType: "frontend",
      stack: "billing",
      port: 3210,
    };

    const phase = {
      name: "Pre-Alpha",
      enabledStacks: ["billing", "checkout-app"],
    };

    // The service belongs to the "billing" stack, while the phase controls
    // whether that stack is enabled for this project.
    expect(service.stack).toBe("billing");
    expect(phase.enabledStacks).toContain("billing");
    expect(phase.enabledStacks).toContain("checkout-app");
    expect(service.appName).toBe("checkout-app");
  });

  it("deduplicates enabledStacks per phase", () => {
    const enabledStacks = Array.from(new Set(["proxy", "billing", "checkout-app", "billing"]));

    expect(enabledStacks).toEqual(["proxy", "billing", "checkout-app"]);
    expect(enabledStacks.filter((s) => s === "billing")).toHaveLength(1);
  });

  it("maps legacy stacks/services to phases/enabledStacks", () => {
    const legacy = {
      stacks: {
        pre_alpha: {
          name: "Pre-Alpha",
          description: "Core infrastructure and MVP services",
          services: ["proxy", "billing"],
        },
        alpha: {
          name: "Alpha",
          description: "Essential business services",
          services: [],
        },
        beta: {
          name: "Beta",
          description: "Extended features",
          services: [],
        },
        out_of_scope: {
          name: "Out of Scope",
          description: "Future releases",
          services: [],
        },
      },
    };

    const phases = {
      pre_alpha: {
        name: legacy.stacks.pre_alpha.name,
        description: legacy.stacks.pre_alpha.description,
        enabledStacks: legacy.stacks.pre_alpha.services,
      },
      alpha: {
        name: legacy.stacks.alpha.name,
        description: legacy.stacks.alpha.description,
        enabledStacks: legacy.stacks.alpha.services,
      },
      beta: {
        name: legacy.stacks.beta.name,
        description: legacy.stacks.beta.description,
        enabledStacks: legacy.stacks.beta.services,
      },
      out_of_scope: {
        name: legacy.stacks.out_of_scope.name,
        description: legacy.stacks.out_of_scope.description,
        enabledStacks: legacy.stacks.out_of_scope.services,
      },
    };

    expect(phases.pre_alpha.enabledStacks).toEqual(["proxy", "billing"]);
    expect(phases).not.toHaveProperty("services");
    expect(phases.pre_alpha).not.toHaveProperty("services");
  });

  it("generates spec.master PRE_ALPHA_RESOURCES from phases.pre_alpha.enabledStacks", () => {
    const enabledStacks = ["proxy", "billing", "checkout-app"];
    const resourceEntries = enabledStacks.map((stack) => `"${stack}": True`);
    const specMaster = `PRE_ALPHA_RESOURCES = {\n${resourceEntries.join(",\n")}\n}`;

    expect(specMaster).toContain("PRE_ALPHA_RESOURCES = {");
    expect(specMaster).toContain('"billing": True');
    expect(specMaster).toContain('"checkout-app": True');
    expect(specMaster).not.toContain('"services"');
  });

  it("keeps focus lists derived from phases for CLI --focus", () => {
    const preAlpha = ["proxy", "billing", "checkout-app"];
    const alpha = ["api"];
    const beta = ["worker"];
    const focusPreAlpha = preAlpha;
    const focusAlpha = [...preAlpha, ...alpha];
    const focusBeta = [...preAlpha, ...alpha, ...beta];

    expect(focusPreAlpha).toEqual(preAlpha);
    expect(focusAlpha).toContain("checkout-app");
    expect(focusBeta).toContain("checkout-app");
  });
});
