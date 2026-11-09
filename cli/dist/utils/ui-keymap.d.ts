import type { Tab, TabId } from "../types/index.js";
export type UiKeymapGroup = "Navigation" | "Actions";
export interface UiKeymapEntry {
    id: string;
    keys: readonly string[];
    label: string;
    group: UiKeymapGroup;
    display?: {
        ascii?: string;
        unicode?: string;
    };
    tabs?: readonly TabId[];
}
export declare const TABS: Tab[];
export declare const UI_KEYMAP: readonly [{
    readonly id: "list-navigation";
    readonly keys: readonly ["ArrowUp", "ArrowDown", "j", "k"];
    readonly label: "Navigate list items";
    readonly group: "Navigation";
    readonly display: {
        readonly ascii: "UP/DOWN or k/j";
        readonly unicode: "↑/↓ or k/j";
    };
    readonly tabs: readonly ["overview", "resources", "files", "config"];
}, {
    readonly id: "first-last";
    readonly keys: readonly ["g", "G", "Home", "End"];
    readonly label: "First/last item";
    readonly group: "Navigation";
    readonly display: {
        readonly ascii: "g/G or Home/End";
        readonly unicode: "g/G or Home/End";
    };
    readonly tabs: readonly ["overview", "resources", "files", "config"];
}, {
    readonly id: "page-list";
    readonly keys: readonly ["PageUp", "PageDown"];
    readonly label: "Move one page";
    readonly group: "Navigation";
    readonly display: {
        readonly ascii: "PgUp/PgDn";
        readonly unicode: "PgUp/PgDn";
    };
    readonly tabs: readonly ["overview", "resources", "files", "config"];
}, {
    readonly id: "select";
    readonly keys: readonly ["Enter", "Space"];
    readonly label: "Select item / Open detail";
    readonly group: "Navigation";
    readonly display: {
        readonly ascii: "Enter or Space";
        readonly unicode: "Enter or Space";
    };
    readonly tabs: readonly ["overview", "resources", "files", "config"];
}, {
    readonly id: "cycle-tabs";
    readonly keys: readonly ["Tab", "Shift+Tab"];
    readonly label: "Next / previous tab";
    readonly group: "Navigation";
    readonly display: {
        readonly ascii: "Tab/Shift+Tab";
        readonly unicode: "Tab/Shift+Tab";
    };
}, {
    readonly id: "direct-tabs";
    readonly keys: string[];
    readonly label: "Direct tab access";
    readonly group: "Navigation";
    readonly display: {
        readonly ascii: string;
        readonly unicode: string;
    };
}, {
    readonly id: "toggle-mouse";
    readonly keys: readonly ["m"];
    readonly label: "Toggle mouse support";
    readonly group: "Actions";
}, {
    readonly id: "toggle-tooltips";
    readonly keys: readonly ["t"];
    readonly label: "Toggle tooltips";
    readonly group: "Actions";
}, {
    readonly id: "toggle-enabled";
    readonly keys: readonly ["e"];
    readonly label: "Toggle enabled/disabled services";
    readonly group: "Actions";
    readonly tabs: readonly ["overview", "resources", "files", "config"];
}, {
    readonly id: "refresh";
    readonly keys: readonly ["r"];
    readonly label: "Refresh data";
    readonly group: "Actions";
}, {
    readonly id: "open-url";
    readonly keys: readonly ["o"];
    readonly label: "Open resource URL in browser";
    readonly group: "Actions";
    readonly tabs: readonly ["overview", "resources"];
}, {
    readonly id: "copy-url";
    readonly keys: readonly ["y"];
    readonly label: "Copy resource URL to clipboard";
    readonly group: "Actions";
    readonly tabs: readonly ["overview", "resources"];
}, {
    readonly id: "search";
    readonly keys: readonly ["/"];
    readonly label: "Search/filter";
    readonly group: "Actions";
    readonly tabs: readonly ["overview", "resources", "files", "config"];
}, {
    readonly id: "help";
    readonly keys: readonly ["?"];
    readonly label: "Show this help";
    readonly group: "Actions";
}, {
    readonly id: "quit";
    readonly keys: readonly ["q"];
    readonly label: "Quit";
    readonly group: "Actions";
}, {
    readonly id: "back";
    readonly keys: readonly ["Esc"];
    readonly label: "Back";
    readonly group: "Actions";
}];
export type UiKeymapId = (typeof UI_KEYMAP)[number]["id"];
export declare function formatUiKeyNames(id: UiKeymapId, ascii?: boolean): string;
export declare function formatUiKeyHint(id: UiKeymapId, label?: string, ascii?: boolean): string;
/**
 * Return the active keymap entries for a specific screen/tab.
 * When tab is undefined, all entries are returned.
 */
export declare function getActiveKeymap(tab?: TabId): readonly UiKeymapEntry[];
