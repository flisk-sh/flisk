// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface StatusMessageController {
  show(message: string, durationMs?: number): void;
  dispose(): void;
}

export function createStatusMessageController(
  setMessage: (message: string) => void,
): StatusMessageController {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    show(message, durationMs = 1500) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      setMessage(message);
      timer = setTimeout(() => {
        timer = undefined;
        setMessage("");
      }, durationMs);
    },
    dispose() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
