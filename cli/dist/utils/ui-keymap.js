export const TABS = [
    { id: "overview", label: "OVERVIEW", shortcut: "1" },
    { id: "resources", label: "RESOURCES", shortcut: "2" },
    { id: "events", label: "EVENTS", shortcut: "3" },
    { id: "files", label: "FILES", shortcut: "4" },
    { id: "config", label: "CONFIG", shortcut: "5" },
];
const tabRange = `${TABS.at(0)?.shortcut}-${TABS.at(-1)?.shortcut}`;
const uiKeymap = [
    {
        id: "list-navigation",
        keys: ["ArrowUp", "ArrowDown", "j", "k"],
        label: "Navigate list items",
        group: "Navigation",
        display: { ascii: "UP/DOWN or k/j", unicode: "↑/↓ or k/j" },
    },
    {
        id: "first-last",
        keys: ["g", "G", "Home", "End"],
        label: "First/last item",
        group: "Navigation",
        display: { ascii: "g/G or Home/End", unicode: "g/G or Home/End" },
    },
    {
        id: "page-list",
        keys: ["PageUp", "PageDown"],
        label: "Move one page",
        group: "Navigation",
        display: { ascii: "PgUp/PgDn", unicode: "PgUp/PgDn" },
    },
    {
        id: "select",
        keys: ["Enter", "Space"],
        label: "Select item / Open detail",
        group: "Navigation",
        display: { ascii: "Enter or Space", unicode: "Enter or Space" },
    },
    {
        id: "cycle-tabs",
        keys: ["Tab", "Shift+Tab"],
        label: "Next / previous tab",
        group: "Navigation",
        display: { ascii: "Tab/Shift+Tab", unicode: "Tab/Shift+Tab" },
    },
    {
        id: "direct-tabs",
        keys: TABS.map((tab) => tab.shortcut),
        label: "Direct tab access",
        group: "Navigation",
        display: { ascii: tabRange, unicode: tabRange },
    },
    {
        id: "toggle-mouse",
        keys: ["m"],
        label: "Toggle mouse support",
        group: "Actions",
    },
    {
        id: "toggle-tooltips",
        keys: ["t"],
        label: "Toggle tooltips",
        group: "Actions",
    },
    {
        id: "toggle-enabled",
        keys: ["e"],
        label: "Toggle enabled/disabled services",
        group: "Actions",
    },
    {
        id: "refresh",
        keys: ["r"],
        label: "Refresh data",
        group: "Actions",
    },
    {
        id: "open-url",
        keys: ["o"],
        label: "Open resource URL in browser",
        group: "Actions",
    },
    {
        id: "copy-url",
        keys: ["y"],
        label: "Copy resource URL to clipboard",
        group: "Actions",
    },
    {
        id: "search",
        keys: ["/"],
        label: "Search/filter",
        group: "Actions",
    },
    {
        id: "help",
        keys: ["?"],
        label: "Show this help",
        group: "Actions",
    },
    {
        id: "quit",
        keys: ["q"],
        label: "Quit",
        group: "Actions",
    },
    {
        id: "back",
        keys: ["Esc"],
        label: "Back",
        group: "Actions",
    },
];
export const UI_KEYMAP = uiKeymap;
function getUiKeymapEntry(id) {
    const entry = UI_KEYMAP.find((shortcut) => shortcut.id === id);
    if (!entry) {
        throw new Error(`Unknown TDK UI shortcut: ${id}`);
    }
    return entry;
}
export function formatUiKeyNames(id, ascii = false) {
    const entry = getUiKeymapEntry(id);
    const display = ascii ? entry.display?.ascii : entry.display?.unicode;
    return display ?? entry.keys.join("/");
}
export function formatUiKeyHint(id, label, ascii = false) {
    const entry = getUiKeymapEntry(id);
    return `[${formatUiKeyNames(id, ascii)}] ${label ?? entry.label}`;
}
