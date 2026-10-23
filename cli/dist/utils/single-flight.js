// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Runs a load and applies its result, but starts nothing while a previous load is still running. A poll on a timer
 * therefore never overlaps itself: results cannot arrive out of order, and a slow Tilt cannot make every poll get
 * superseded before it finishes.
 */
export function singleFlight(apply) {
    let running = false;
    return async (load) => {
        if (running)
            return;
        running = true;
        try {
            apply(await load());
        }
        finally {
            running = false;
        }
    };
}
