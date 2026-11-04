// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

export interface ShownError {
  message: string;
  suggestions: string[];
}

let lastShown: ShownError | undefined;

/** Remembers the error a command just printed, so a JSON failure object can carry the real reason. */
export function rememberShownError(error: ShownError): void {
  lastShown = error;
}

/** The last error printed with `showError`, or undefined when none was. */
export function lastShownError(): ShownError | undefined {
  return lastShown;
}

/** Clears the remembered error (tests). */
export function forgetShownError(): void {
  lastShown = undefined;
}
