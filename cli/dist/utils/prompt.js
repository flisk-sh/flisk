// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
async function question(prompt) {
    const rl = createInterface({ input, output });
    try {
        // Without this, a closed stdin (CI, `< /dev/null`, a pipe) leaves the
        // question pending forever and Node exits 0 having done nothing.
        return await new Promise((resolve, reject) => {
            rl.once("close", () => reject(new Error("No input available to answer the prompt. Run this in a terminal.")));
            rl.question(prompt).then((answer) => resolve(answer.trim()), reject);
        });
    }
    finally {
        rl.close();
    }
}
export async function promptText(options) {
    const suffix = options.initial ? ` (${options.initial})` : "";
    while (true) {
        const answer = await question(`${options.message}${suffix} `);
        const value = answer || options.initial || "";
        const validation = options.validate?.(value) ?? true;
        if (validation === true) {
            return value;
        }
        console.log(validation);
    }
}
export async function promptConfirm(options) {
    const defaultValue = options.initial ?? true;
    const suffix = defaultValue ? "Y/n" : "y/N";
    while (true) {
        const answer = (await question(`${options.message} (${suffix}) `)).toLowerCase();
        if (!answer)
            return defaultValue;
        if (["y", "yes"].includes(answer))
            return true;
        if (["n", "no"].includes(answer))
            return false;
        console.log("Please answer yes or no.");
    }
}
export async function promptSelect(options) {
    console.log(options.message);
    options.choices.forEach((choice, index) => {
        console.log(`  ${index + 1}. ${choice.title}`);
    });
    while (true) {
        const answer = await question("Choose one: ");
        const selectedIndex = Number.parseInt(answer, 10) - 1;
        const selected = options.choices[selectedIndex];
        if (selected) {
            return selected.value;
        }
        console.log(`Enter a number from 1 to ${options.choices.length}.`);
    }
}
export async function promptMultiSelect(options) {
    const defaults = options.choices
        .map((choice, index) => (choice.selected ? index + 1 : null))
        .filter((index) => index !== null);
    const defaultHint = defaults.length > 0 ? ` [${defaults.join(",")}]` : "";
    console.log(options.message);
    options.choices.forEach((choice, index) => {
        const marker = choice.selected ? "*" : " ";
        console.log(` ${marker} ${index + 1}. ${choice.title}`);
    });
    while (true) {
        const answer = await question(`Choose one or more numbers, comma-separated${defaultHint}: `);
        let rawIndexes = defaults;
        if (answer) {
            const tokens = answer.split(",").map((value) => value.trim());
            const invalidToken = tokens.find((token) => {
                if (!/^\d+$/.test(token))
                    return true;
                const index = Number.parseInt(token, 10);
                return !options.choices[index - 1];
            });
            if (invalidToken !== undefined) {
                console.log(`"${invalidToken}" is not a valid choice (1-${options.choices.length})`);
                continue;
            }
            rawIndexes = tokens.map((token) => Number.parseInt(token, 10));
        }
        const selected = Array.from(new Set(rawIndexes))
            .map((index) => options.choices[index - 1])
            .filter((choice) => Boolean(choice))
            .map((choice) => choice.value);
        const validation = options.validate?.(selected) ?? true;
        if (validation === true) {
            return selected;
        }
        console.log(validation);
    }
}
