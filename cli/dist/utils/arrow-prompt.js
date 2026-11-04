// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Arrow-key prompts: move with the arrows, choose with Enter, never type a number.
 *
 * `flisk create` uses these so the first run is a few key presses (the way `create-t3-app` works)
 * instead of typed answers. The keys and the frame are plain functions, so tests drive them without a
 * terminal; `arrowSelect`, `arrowMultiSelect` and `arrowText` only wire those to a TTY stream.
 */
import { emitKeypressEvents } from "node:readline";
import chalk from "chalk";
/** Thrown when the person presses Ctrl-C or Escape, so the caller can stop without a stack trace. */
export class PromptCancelled extends Error {
    constructor() {
        super("Cancelled");
        this.name = "PromptCancelled";
    }
}
const defaultStreams = () => ({ input: process.stdin, output: process.stdout });
/** Moves a highlighted row up or down, wrapping at both ends. */
export function moveIndex(index, count, delta) {
    if (count <= 0)
        return 0;
    return (index + delta + count) % count;
}
/** The choices whose title, id or hint contains every word typed, case-insensitively. */
export function filterChoices(choices, filter) {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return [...choices];
    return choices.filter((choice) => {
        const text = `${choice.title} ${choice.value} ${choice.hint ?? ""}`.toLowerCase();
        return words.every((word) => text.includes(word));
    });
}
export function menuAction(key) {
    if (key.ctrl && key.name === "c")
        return "cancel";
    if (key.name === "escape")
        return "cancel";
    if (key.name === "up" || key.name === "k")
        return "up";
    if (key.name === "down" || key.name === "j")
        return "down";
    if (key.name === "space" || key.sequence === " ")
        return "toggle";
    if (key.name === "return" || key.name === "enter")
        return "submit";
    return "none";
}
/** The rows of a menu, plain text for the caller to colour. Pure, so the layout is testable. */
export function renderMenu(frame) {
    const rows = [`${chalk.cyan("◆")} ${chalk.bold(frame.message)}`];
    if (frame.filter !== undefined) {
        rows.push(`${chalk.dim("│")} ${chalk.dim("filter:")} ${frame.filter || chalk.dim("type to narrow the list")}${chalk.dim("▏")}`);
    }
    frame.choices.forEach((choice, index) => {
        const active = index === frame.cursor;
        const mark = frame.ticked ? (frame.ticked.has(choice.value) ? "◼" : "◻") : active ? "●" : "○";
        const title = active ? chalk.cyan(choice.title) : chalk.dim(choice.title);
        const hint = choice.hint ? chalk.dim(`  ${choice.hint}`) : "";
        const pointer = active ? chalk.cyan("›") : " ";
        rows.push(`${chalk.dim("│")} ${pointer} ${active ? chalk.cyan(mark) : chalk.dim(mark)} ${title}${hint}`);
    });
    rows.push(chalk.dim(frame.ticked
        ? "└ ↑/↓ move · space tick · Enter confirm"
        : frame.filter !== undefined
            ? "└ ↑/↓ move · type to filter · Enter choose"
            : "└ ↑/↓ move · Enter choose"));
    return rows;
}
/** The line left behind once an answer is given. */
export function renderAnswered(message, answer) {
    return `${chalk.green("◇")} ${message}  ${chalk.dim(answer)}`;
}
/** East Asian wide and fullwidth blocks (CJK, Hangul, kana, fullwidth forms): two terminal columns each. */
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;
/**
 * How many terminal columns one grapheme takes (what a person sees as one character, however many code points it has):
 * 0 for a lone joiner or combining mark, 2 for wide text and emoji, 1 for everything else.
 *
 * A joined emoji (family, profession, flag) or one with a skin tone is a single grapheme and two columns. Text-style
 * symbols such as © and ™ are one column unless a variation selector asks for the emoji form.
 */
export function cellWidth(grapheme) {
    if (/^(?:\p{Mn}|\p{Me}|\p{Cf}|[\u{FE00}-\u{FE0F}])+$/u.test(grapheme))
        return 0;
    if (WIDE.test(grapheme))
        return 2;
    if (/\p{Emoji_Presentation}|\u{FE0F}|\p{Regional_Indicator}/u.test(grapheme))
        return 2;
    return 1;
}
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** The graphemes of a line, colour codes removed. */
function graphemes(line) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences are control codes
    const plain = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    return [...segmenter.segment(plain)].map((part) => part.segment);
}
/** The visible width of a line in terminal columns: colour codes take none, wide characters and emoji two. */
export function visibleWidth(line) {
    let width = 0;
    for (const grapheme of graphemes(line))
        width += cellWidth(grapheme);
    return width;
}
/**
 * How many terminal lines a frame takes. A row wider than the terminal wraps onto more lines, and the cursor can only
 * move back over the lines it really printed, so a miscount leaves an old copy of the menu on screen.
 */
export function framedLines(rows, columns) {
    const width = Math.max(1, columns);
    return rows.reduce((total, row) => total + Math.max(1, Math.ceil(visibleWidth(row) / width)), 0);
}
/** Cuts a row to the terminal width, so a long description never wraps and the menu stays one line per choice. */
export function fitRow(row, columns) {
    const max = Math.max(10, columns - 1);
    if (visibleWidth(row) <= max)
        return row;
    // Cut by columns and whole graphemes, so a wide character never pushes the row past the edge and an emoji is
    // never split in the middle of its sequence.
    let kept = "";
    let width = 0;
    for (const grapheme of graphemes(row)) {
        const next = cellWidth(grapheme);
        if (width + next > max - 1)
            break;
        kept += grapheme;
        width += next;
    }
    return `${kept}…`;
}
/** Clears the last `lines` terminal lines the cursor is below, and puts the cursor back at the first. */
function eraseRows(output, lines) {
    if (lines > 0)
        output.write(`\x1b[${lines}A`);
    output.write("\r\x1b[0J");
}
/** Reads keypresses until `onKey` returns a value. Raw mode and the cursor are always put back. */
function readKeys(streams, onKey) {
    const { input, output } = streams;
    emitKeypressEvents(input);
    const wasRaw = input.isRaw === true;
    input.setRawMode?.(true);
    input.resume();
    output.write("\x1b[?25l");
    return new Promise((resolve, reject) => {
        const finish = (settle) => {
            input.off("keypress", handler);
            input.off("end", closed);
            input.off("close", closed);
            input.setRawMode?.(wasRaw);
            input.pause();
            output.write("\x1b[?25h");
            settle();
        };
        const handler = (str, key) => {
            const pressed = key ?? { sequence: str };
            if (menuAction(pressed) === "cancel") {
                finish(() => reject(new PromptCancelled()));
                return;
            }
            const result = onKey(pressed, str);
            if (result)
                finish(() => resolve(result.done));
        };
        // A closed input (a pipe that ended, a detached terminal) can never answer: cancel instead of waiting forever.
        const closed = () => finish(() => reject(new PromptCancelled()));
        input.on("keypress", handler);
        input.once("end", closed);
        input.once("close", closed);
    });
}
/** Pick one: arrows to move, Enter to choose. With `filterable`, typing narrows a long list. */
export async function arrowSelect(options, streams = defaultStreams()) {
    const { output } = streams;
    let filter = "";
    let cursor = Math.max(0, options.choices.findIndex((choice) => choice.value === options.initial));
    // The choices visible right now: the filter narrows them when the menu is filterable.
    const visible = () => options.filterable ? filterChoices(options.choices, filter) : options.choices;
    let drawn = 0;
    // Overwrites the menu in place: erases exactly the lines the last frame printed, then draws again.
    const draw = () => {
        eraseRows(output, drawn);
        const shown = visible();
        cursor = Math.min(cursor, Math.max(0, shown.length - 1));
        const rows = renderMenu({
            message: options.message,
            choices: shown,
            cursor,
            ...(options.filterable ? { filter } : {}),
        });
        if (shown.length === 0)
            rows.splice(options.filterable ? 2 : 1, 0, chalk.dim("│   nothing matches · Backspace clears what you typed"));
        const width = output.columns ?? 80;
        const fitted = rows.map((row) => fitRow(row, width));
        output.write(`${fitted.join("\n")}\n`);
        drawn = framedLines(fitted, width);
    };
    draw();
    try {
        const chosen = await readKeys(streams, (key, str) => {
            const action = menuAction(key);
            const shown = visible();
            // In a filtering menu the letters belong to the filter, so only the arrows move.
            const typed = options.filterable && str && str.length === 1 && str >= " " && !key.ctrl;
            if (options.filterable && key.name === "backspace") {
                filter = filter.slice(0, -1);
                draw();
                return undefined;
            }
            if (typed && action !== "submit") {
                filter += str;
                cursor = 0;
                draw();
                return undefined;
            }
            if (action === "up" || action === "down") {
                cursor = moveIndex(cursor, shown.length, action === "up" ? -1 : 1);
                draw();
            }
            const current = shown[cursor];
            return action === "submit" && current ? { done: current.value } : undefined;
        });
        eraseRows(output, drawn);
        const picked = options.choices.find((choice) => choice.value === chosen);
        output.write(`${renderAnswered(options.message, picked?.title ?? chosen)}\n`);
        return chosen;
    }
    catch (error) {
        eraseRows(output, drawn);
        throw error;
    }
}
/** Pick any number: arrows to move, space to tick, Enter to confirm (nothing ticked is fine). */
export async function arrowMultiSelect(options, streams = defaultStreams()) {
    const { output } = streams;
    let cursor = 0;
    const ticked = new Set(options.choices.filter((choice) => choice.selected).map((choice) => choice.value));
    let drawn = 0;
    // Overwrites the tick list in place: erases exactly the lines the last frame printed, then draws again.
    const draw = () => {
        eraseRows(output, drawn);
        const rows = renderMenu({ message: options.message, choices: options.choices, cursor, ticked });
        const width = output.columns ?? 80;
        const fitted = rows.map((row) => fitRow(row, width));
        output.write(`${fitted.join("\n")}\n`);
        drawn = framedLines(fitted, width);
    };
    draw();
    try {
        await readKeys(streams, (key) => {
            const action = menuAction(key);
            const current = options.choices[cursor];
            if (action === "up" || action === "down") {
                cursor = moveIndex(cursor, options.choices.length, action === "up" ? -1 : 1);
                draw();
            }
            else if (action === "toggle" && current) {
                if (ticked.has(current.value))
                    ticked.delete(current.value);
                else
                    ticked.add(current.value);
                draw();
            }
            return action === "submit" ? { done: true } : undefined;
        });
        eraseRows(output, drawn);
        const titles = options.choices.filter((c) => ticked.has(c.value)).map((c) => c.title);
        output.write(`${renderAnswered(options.message, titles.length ? titles.join(", ") : "none")}\n`);
        return options.choices.filter((c) => ticked.has(c.value)).map((c) => c.value);
    }
    catch (error) {
        eraseRows(output, drawn);
        throw error;
    }
}
/** A line of text with a default: press Enter to take it, or type to replace it. */
export async function arrowText(options, streams = defaultStreams()) {
    const { output } = streams;
    let typed = "";
    let problem = "";
    let drawn = 0;
    // Overwrites the name line in place: erases exactly the lines the last frame printed, then draws again.
    const draw = () => {
        eraseRows(output, drawn);
        const shown = typed.length > 0 ? chalk.cyan(typed) : chalk.dim(options.initial);
        const rows = [
            `${chalk.cyan("◆")} ${chalk.bold(options.message)}  ${shown}${chalk.dim("▏")}`,
            problem ? chalk.red(`│ ${problem}`) : chalk.dim("└ Enter to accept, or type a name"),
        ];
        const width = output.columns ?? 80;
        const fitted = rows.map((row) => fitRow(row, width));
        output.write(`${fitted.join("\n")}\n`);
        drawn = framedLines(fitted, width);
    };
    draw();
    try {
        const value = await readKeys(streams, (key, str) => {
            const action = menuAction(key);
            if (action === "submit") {
                const candidate = typed.length > 0 ? typed : options.initial;
                const verdict = options.validate?.(candidate) ?? true;
                if (verdict === true)
                    return { done: candidate };
                problem = verdict;
                draw();
                return undefined;
            }
            if (key.name === "backspace") {
                typed = typed.slice(0, -1);
            }
            else if (str && str.length === 1 && str >= " " && !key.ctrl) {
                typed += str;
            }
            else {
                return undefined;
            }
            problem = "";
            draw();
            return undefined;
        });
        eraseRows(output, drawn);
        output.write(`${renderAnswered(options.message, value)}\n`);
        return value;
    }
    catch (error) {
        eraseRows(output, drawn);
        throw error;
    }
}
