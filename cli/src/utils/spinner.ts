// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Minimal ora-style spinner: animates on a TTY, prints plain lines otherwise. */
export interface Spinner {
  text: string;
  succeed(message?: string): void;
  fail(message?: string): void;
  warn(message?: string): void;
}

export function startSpinner(initialText: string): Spinner {
  const stream = process.stderr;
  const animate = stream.isTTY === true;
  let frame = 0;
  let text = initialText;
  let timer: NodeJS.Timeout | undefined;

  const render = () => stream.write(`\r\x1b[2K${chalk.cyan(FRAMES[frame])} ${text}`);
  if (animate) {
    render();
    timer = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
      render();
    }, 80);
  } else {
    stream.write(`- ${text}\n`);
  }

  const finish = (symbol: string, message?: string) => {
    if (timer) clearInterval(timer);
    stream.write(`${animate ? "\r\x1b[2K" : ""}${symbol} ${message ?? text}\n`);
  };

  return {
    get text() {
      return text;
    },
    set text(value: string) {
      text = value;
      if (!animate) stream.write(`- ${text}\n`);
    },
    succeed: (message) => finish(chalk.green("✔"), message),
    fail: (message) => finish(chalk.red("✖"), message),
    warn: (message) => finish(chalk.yellow("⚠"), message),
  };
}
