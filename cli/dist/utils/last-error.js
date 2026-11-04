// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
let lastShown;
/** Remembers the error a command just printed, so a JSON failure object can carry the real reason. */
export function rememberShownError(error) {
    lastShown = error;
}
/** The last error printed with `showError`, or undefined when none was. */
export function lastShownError() {
    return lastShown;
}
/** Clears the remembered error (tests). */
export function forgetShownError() {
    lastShown = undefined;
}
