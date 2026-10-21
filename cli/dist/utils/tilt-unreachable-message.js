// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * What `flisk logs` says when no Tilt answers on the port. The usual cause is that the stack is not up, so the message
 * names the command that starts it; Tilt's own connection error is not repeated, because it only restates that.
 */
export function tiltUnreachableMessage(port) {
    return `Could not reach Tilt on port ${port}. The stack is not running, or Tilt is on another port. Start it with: flisk up`;
}
