// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { DATABASE_MANAGEMENT_FEATURE } from "./constants.js";
/**
 * Project-Level Features
 *
 * These are infrastructure and optional services enabled at the project level.
 * They are available to all resources and are configured in project.json stacks.
 *
 * Default: All CORE features enabled in pre_alpha stack
 * Optional/premium: disabled by default (can be enabled in optional_infra)
 */

export interface ProjectFeature {
  name: string;
  description: string;
  category: "core" | "optional" | "premium";
  phase: "pre_alpha" | "alpha" | "beta";
  enabled_by_default: boolean;
  dependsOn?: string[];
}

export const PROJECT_FEATURES: Record<string, ProjectFeature> = {
  // ============================================================================
  // CORE INFRASTRUCTURE (always enabled in pre_alpha)
  // ============================================================================
  proxy: {
    name: "proxy",
    description: "Traefik reverse proxy and API gateway for routing all services",
    category: "core",
    phase: "pre_alpha",
    enabled_by_default: true,
    dependsOn: [],
  },

  // Key/name must be the literal Tilt resource name (PlatformDockerConstants.VERDACCIO_RESOURCE_NAME
  // in tdk-cli-extensions), since project.json's services list is copied verbatim into
  // PRE_ALPHA_RESOURCES and matched against that name by should_enable(). "registry" would
  // silently fail to enable Verdaccio.
  verdaccio: {
    name: "verdaccio",
    description:
      "Verdaccio npm registry for package management and local publishing (Premium - requires TDK_LICENSE_KEY)",
    category: "premium",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: [],
  },

  [DATABASE_MANAGEMENT_FEATURE]: {
    name: DATABASE_MANAGEMENT_FEATURE,
    description: "PostgreSQL database for data persistence and SQL operations",
    category: "core",
    phase: "pre_alpha",
    enabled_by_default: true,
    dependsOn: [],
  },

  // ============================================================================
  // OPTIONAL INFRASTRUCTURE (disabled by default, enable in optional_infra)
  // ============================================================================
  monitoring: {
    name: "monitoring",
    description: "SigNoz or SkyWalking observability platform for monitoring and tracing",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: [DATABASE_MANAGEMENT_FEATURE],
  },

  elk: {
    name: "elk",
    description: "Elasticsearch, Logstash, Kibana stack for log aggregation and analysis",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: [],
  },

  debezium: {
    name: "debezium",
    description: "Change Data Capture for real-time data streaming from databases",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: false,
    dependsOn: [DATABASE_MANAGEMENT_FEATURE],
  },

  "golden-image": {
    name: "golden-image",
    description: "Pre-built Docker image layer for faster builds and smaller deployments",
    category: "optional",
    phase: "pre_alpha",
    enabled_by_default: true,
    dependsOn: [],
  },
};

/**
 * Get all enabled project features
 */
export function getEnabledProjectFeatures(optional_infra?: Record<string, boolean>): string[] {
  const enabled: string[] = [];

  for (const [key, feature] of Object.entries(PROJECT_FEATURES)) {
    if (feature.enabled_by_default) {
      enabled.push(key);
    }
  }

  // Add optional features if enabled
  if (optional_infra) {
    for (const [key, isEnabled] of Object.entries(optional_infra)) {
      if (isEnabled && PROJECT_FEATURES[key]) {
        enabled.push(key);
      }
    }
  }

  return enabled;
}
