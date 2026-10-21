// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource, StackMetadata } from "../types/index.js";
import { getDeferredResourceNames } from "./doctor-runtime.js";
import { deriveServiceStates, type ServiceRuntimeState } from "./service-runtime-state.js";
import { deriveStackStatus } from "./stack-status.js";
import { tiltGetUiResources } from "./up-readiness.js";

export type ServiceStates = Record<string, ServiceRuntimeState>;

/** One look at the running Tilt. Empty when no Tilt answers, so every service stays unknown. */
export async function fetchServiceStates(
  services: DiscoveredResource[],
  tiltPort: number,
): Promise<ServiceStates> {
  try {
    const text = await tiltGetUiResources(tiltPort);
    if (!text) return {};
    return deriveServiceStates(
      text,
      Object.fromEntries(services.map((r) => [r.name, r.config?.dependsOn ?? []])),
      getDeferredResourceNames(),
    );
  } catch {
    return {};
  }
}

/** The same states `flisk status` shows, put onto the stack the UI is about to draw. */
export function applyServiceStates(metadata: StackMetadata, states: ServiceStates): StackMetadata {
  const resources = metadata.resources.map((resource) => {
    const state = states[resource.name];
    if (!state) return resource;
    return {
      ...resource,
      status: state.status,
      ...(state.reason ? { statusReason: state.reason } : {}),
    };
  });
  return {
    ...metadata,
    resources,
    overallStatus: deriveStackStatus(resources.map((r) => r.status)),
  };
}
