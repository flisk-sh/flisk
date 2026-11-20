/** The rows of the `flisk --help` table, including the example each row prints. */
export declare const COMMAND_GROUPS: {
    title: string;
    color: import("chalk").ChalkInstance;
    commands: {
        name: string;
        desc: string;
        alias: string;
    }[];
}[];
/** Every command name and alias that the help table lists. */
export declare function listedCommandNames(): string[];
/** Help for the one-command demo flow, so `flisk demo --help` lists the flags it reads (#4487). */
export declare function showDemoHelp(): void;
export declare function showHelp(): void;
