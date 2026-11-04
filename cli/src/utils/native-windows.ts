// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * The message native Windows gets when a command needs a stack.
 *
 * Native Windows runs services that declare a `command` as local processes, and `flisk demo` falls back
 * to its local-process demo. For a container stack it is inspection-only: `flisk --version`, `flisk doctor`
 * and `flisk up --dry-run` work, and starting the stack needs Ubuntu on WSL2. `flisk up` and the
 * one-command flow of a Docker starter refuse with this message before they touch the machine.
 */
export const NATIVE_WINDOWS_REFUSAL =
  "Landscape startup needs Ubuntu on WSL2. Native Windows runs only services that declare a command, as local processes.";

/**
 * Why a command that starts a stack cannot run on this host, or null when it may proceed.
 *
 * `FLISK_ALLOW_NATIVE_WINDOWS=1` is the unsupported escape hatch that lets it try anyway.
 */
export function nativeWindowsStackRefusal(
  platform: string,
  allowNativeWindows?: string,
): string | null {
  if (platform !== "win32" || allowNativeWindows === "1") return null;
  return NATIVE_WINDOWS_REFUSAL;
}
