// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { DATABASE_MANAGEMENT_FEATURE } from "./constants.js";
export const STACK_FEATURES = {
    [DATABASE_MANAGEMENT_FEATURE]: {
        name: DATABASE_MANAGEMENT_FEATURE,
        description: "Generate and load the stack-level PostgreSQL docker-compose file",
        generatedFiles: ["services/platform/database-management/docker-compose.yml"],
    },
};
export function isStackFeatureEnabledInStacks(stacks, featureName) {
    if (!STACK_FEATURES[featureName])
        return false;
    return ["pre_alpha", "alpha", "beta"].some((phase) => stacks[phase]?.enabledStacks?.includes(featureName));
}
