import type { DiscoveredResource, ServiceRuntimeState, StackMetadata } from "../types/index.js";
export type ServiceStates = Record<string, ServiceRuntimeState>;
/** One look at the running Tilt. Empty when no Tilt answers, so every service stays unknown. */
export declare function fetchServiceStates(services: DiscoveredResource[], tiltPort: number): Promise<ServiceStates>;
/** The same states `flisk status` shows, put onto the stack the UI is about to draw. */
export declare function applyServiceStates(metadata: StackMetadata, states: ServiceStates): StackMetadata;
