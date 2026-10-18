import { Command } from "commander";
import type React from "react";
import type { LoadingScreenProps, TabId } from "../types/index.js";
export declare const LoadingScreen: React.FC<LoadingScreenProps>;
export declare const TUIApp: React.FC<{
    animated?: boolean;
}>;
/** Compose footer guidance for the current tab and terminal character set. */
export declare function createHelpHint(activeTab: TabId, selectedStack: string | null, selectedService: string | null, showEnabledOnly: boolean, ascii: boolean): string;
export declare const uiCommand: Command;
