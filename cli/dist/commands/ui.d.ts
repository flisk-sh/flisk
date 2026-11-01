import { Command } from "commander";
import type React from "react";
import type { DiscoveredResource, LoadingScreenProps, TabId } from "../types/index.js";
export declare const LoadingScreen: React.FC<LoadingScreenProps>;
/**
 * The address the agent panel reads the selected agent through: its ingress route, or localhost at its own port when every
 * service runs as a local process. Null when the selection is not an agent or it has no address.
 */
export declare function agentRouteOf(services: readonly DiscoveredResource[], selectedService: string | null | undefined, ingressPort: number | undefined): {
    name: string;
    url: string;
} | null;
export declare const TUIApp: React.FC<{
    animated?: boolean;
}>;
/** Compose footer guidance for the current tab and terminal character set. */
export declare function createHelpHint(activeTab: TabId, selectedStack: string | null, selectedService: string | null, showEnabledOnly: boolean, ascii: boolean): string;
export declare const uiCommand: Command;
