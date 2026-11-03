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
/** What a keypress means to a menu. */
export type MenuAction = "up" | "down" | "toggle" | "submit" | "cancel" | "none";
export declare function menuAction(key: KeyPress): MenuAction;
interface MenuFrame<T extends string> {
    message: string;
    choices: readonly ArrowChoice<T>[];
    cursor: number;
    /** Multi-select: the ticked values. Undefined for a single choice. */
    ticked?: ReadonlySet<T>;
}
/** The rows of a menu, plain text for the caller to colour. Pure, so the layout is testable. */
export declare function renderMenu<T extends string>(frame: MenuFrame<T>): string[];
/** The line left behind once an answer is given. */
export declare function renderAnswered(message: string, answer: string): string;
/** Pick one: arrows to move, Enter to choose. */
export declare function arrowSelect<T extends string>(options: {
    message: string;
    choices: readonly ArrowChoice<T>[];
    initial?: T;
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
