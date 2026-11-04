// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The frontend framework ids a service.json may name. It lives apart from frontend-frameworks/registry.ts, which imports every
 * provider (and through them most of the CLI), so the `flisk up` gate can check `framework` without an import cycle. A test keeps
 * this list equal to the registry's keys. It is not in frontend-frameworks/: the e2e matrix reads every file there as a framework
 * (cli/src/frontend-frameworks/<name>.ts runs the leg <name>).
 */
export const FRONTEND_FRAMEWORK_IDS = [
    "react",
    "vue",
    "svelte",
    "preact",
    "lit",
    "solid",
    "qwik",
    "vanilla",
    "tanstack-router",
    "next",
];
