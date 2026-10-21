// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { DATABASE_MANAGEMENT_FEATURE } from "./constants.js";
export interface StackFeature {
  name: string;
  description: string;
  generatedFiles: string[];
}

export const STACK_FEATURES: Record<string, StackFeature> = {
  [DATABASE_MANAGEMENT_FEATURE]: {
    name: DATABASE_MANAGEMENT_FEATURE,
    description: "Generate and load the stack-level PostgreSQL docker-compose file",
    generatedFiles: ["services/platform/database-management/docker-compose.yml"],
  },
};

export interface StackFeaturePhaseConfig {
  pre_alpha?: { enabledStacks?: string[] };
  alpha?: { enabledStacks?: string[] };
  beta?: { enabledStacks?: string[] };
  out_of_scope?: { enabledStacks?: string[] };
}

export function isStackFeatureEnabledInStacks(
  stacks: StackFeaturePhaseConfig,
  featureName: string,
): boolean {
  if (!STACK_FEATURES[featureName]) return false;
  return ["pre_alpha", "alpha", "beta"].some((phase) =>
    stacks[phase as keyof StackFeaturePhaseConfig]?.enabledStacks?.includes(featureName),
  );
}
