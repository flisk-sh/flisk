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
/** Clears the last `rows` rows the cursor is below, and puts the cursor back at the first. */
function eraseRows(output, rows) {
    if (rows > 0)
        output.write(`\x1b[${rows}A`);
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
        input.on("keypress", handler);
    });
}
/** Pick one: arrows to move, Enter to choose. With `filterable`, typing narrows a long list. */
export async function arrowSelect(options, streams = defaultStreams()) {
    const { output } = streams;
    let filter = "";
    let cursor = Math.max(0, options.choices.findIndex((choice) => choice.value === options.initial));
    const visible = () => options.filterable ? filterChoices(options.choices, filter) : options.choices;
    let drawn = 0;
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
            rows.splice(options.filterable ? 2 : 1, 0, chalk.dim("│   nothing matches"));
        output.write(`${rows.join("\n")}\n`);
        drawn = rows.length;
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
    const draw = () => {
        eraseRows(output, drawn);
        const rows = renderMenu({ message: options.message, choices: options.choices, cursor, ticked });
        output.write(`${rows.join("\n")}\n`);
        drawn = rows.length;
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
    const draw = () => {
        eraseRows(output, drawn);
        const shown = typed.length > 0 ? chalk.cyan(typed) : chalk.dim(options.initial);
        const rows = [
            `${chalk.cyan("◆")} ${chalk.bold(options.message)}  ${shown}${chalk.dim("▏")}`,
            problem ? chalk.red(`│ ${problem}`) : chalk.dim("└ Enter to accept, or type a name"),
        ];
        output.write(`${rows.join("\n")}\n`);
        drawn = rows.length;
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
