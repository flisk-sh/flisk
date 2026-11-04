/** One keypress, in the shape Node's readline emits. */
export interface KeyPress {
    name?: string;
    sequence?: string;
    ctrl?: boolean;
}
export interface ArrowChoice<T extends string> {
    title: string;
    value: T;
    /** Shown dim after the title. */
    hint?: string;
    /** Multi-select only: ticked when the menu opens. */
    selected?: boolean;
}
/** Thrown when the person presses Ctrl-C or Escape, so the caller can stop without a stack trace. */
export declare class PromptCancelled extends Error {
    constructor();
}
/** The streams a prompt needs; process.stdin and process.stdout by default. */
export interface PromptStreams {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
}
/** Moves a highlighted row up or down, wrapping at both ends. */
export declare function moveIndex(index: number, count: number, delta: 1 | -1): number;
/** The choices whose title, id or hint contains every word typed, case-insensitively. */
export declare function filterChoices<T extends string>(choices: readonly ArrowChoice<T>[], filter: string): ArrowChoice<T>[];
/** What a keypress means to a menu. */
export type MenuAction = "up" | "down" | "toggle" | "submit" | "cancel" | "none";
export declare function menuAction(key: KeyPress): MenuAction;
interface MenuFrame<T extends string> {
    message: string;
    choices: readonly ArrowChoice<T>[];
    cursor: number;
    /** Multi-select: the ticked values. Undefined for a single choice. */
    ticked?: ReadonlySet<T>;
    /** The text typed to narrow a long menu; undefined when the menu does not filter. */
    filter?: string;
}
/** The rows of a menu, plain text for the caller to colour. Pure, so the layout is testable. */
export declare function renderMenu<T extends string>(frame: MenuFrame<T>): string[];
/** The line left behind once an answer is given. */
export declare function renderAnswered(message: string, answer: string): string;
/**
 * How many terminal lines a frame takes. A row wider than the terminal wraps onto more lines, and the cursor can only
 * move back over the lines it really printed, so a miscount leaves an old copy of the menu on screen.
 */
export declare function framedLines(rows: readonly string[], columns: number): number;
/** Cuts a row to the terminal width, so a long description never wraps and the menu stays one line per choice. */
export declare function fitRow(row: string, columns: number): string;
/** Pick one: arrows to move, Enter to choose. With `filterable`, typing narrows a long list. */
export declare function arrowSelect<T extends string>(options: {
    message: string;
    choices: readonly ArrowChoice<T>[];
    initial?: T;
    filterable?: boolean;
}, streams?: PromptStreams): Promise<T>;
/** Pick any number: arrows to move, space to tick, Enter to confirm (nothing ticked is fine). */
export declare function arrowMultiSelect<T extends string>(options: {
    message: string;
    choices: readonly ArrowChoice<T>[];
}, streams?: PromptStreams): Promise<T[]>;
/** A line of text with a default: press Enter to take it, or type to replace it. */
export declare function arrowText(options: {
    message: string;
    initial: string;
    validate?: (value: string) => true | string;
}, streams?: PromptStreams): Promise<string>;
export {};
