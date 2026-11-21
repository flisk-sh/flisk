// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { redactProjectText } from "../secret-redaction.js";
import { findOnPath } from "../which.js";
export function tiltGetUiResources(port) {
    return new Promise((resolve) => {
        execFile(findOnPath("tilt") ?? "tilt", ["get", "uiresources", "-o", "json", "--port", String(port)], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
    });
}
export function tiltResourceLogs(port, name) {
    return new Promise((resolve) => {
        execFile(findOnPath("tilt") ?? "tilt", ["logs", name, "--port", String(port)], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, 
        // An application can print its own environment, so what the user or an agent reads is masked here, at the one place every
        // `flisk up` log excerpt comes from (failure reasons, timeouts, URL checks).
        (error, stdout) => resolve(error ? null : redactProjectText(stdout)));
    });
}
export function formatTail(text, maxLines = 10) {
    const lines = text
        .trimEnd()
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);
    return lines.slice(-maxLines).join("\n");
}
