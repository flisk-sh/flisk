// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource } from "../types/index.js";
import { isApiServiceType } from "./resource-kind.js";

/**
 * Bun runs the generated JS services. A project without any has nothing for Bun to run, so neither `flisk doctor` nor
 * `flisk up` needs it. Doctor and the start-up preflight share this rule so they cannot disagree.
 */
export function projectNeedsBun(resources: readonly DiscoveredResource[]): boolean {
  return resources.some(
    (resource) =>
      isApiServiceType(resource.config?.appType) ||
      resource.config?.appType === "frontend" ||
      resource.config?.appType === "worker",
  );
}
