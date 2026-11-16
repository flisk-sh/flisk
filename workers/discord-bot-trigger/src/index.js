// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Starts the Discord badge bot every 3 minutes. GitHub's own schedule can go hours
// without firing, and contributors are told the bot answers within minutes.
// Once an hour it also starts the Cilytics collect (https://cilytics.flisk.si/), whose
// hourly schedule in flisk-sh/cilytics went a whole afternoon without one run.

const WORKFLOW = "https://api.github.com/repos/flisk-sh/flisk/actions/workflows/discord-founding-role.yml/dispatches";

// The hourly level sync is slow, so every other run only handles new claims. The timer fires on
// minutes divisible by 3, so exactly one run in the window from minute 17 on does the sync.
export const SYNC_MINUTE = 17;
export const RUN_EVERY_MINUTES = 3;

export const CILYTICS = "https://api.github.com/repos/flisk-sh/cilytics/actions/workflows/cilytics.yml/dispatches";

const hourlyWindow = (scheduledTime) => {
  const minute = new Date(scheduledTime).getUTCMinutes();
  return minute >= SYNC_MINUTE && minute < SYNC_MINUTE + RUN_EVERY_MINUTES;
};

async function dispatch(url, token, body, fetchImpl) {
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN is not set.");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "flisk-discord-bot-trigger",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}: ${await response.text()}`);
}

export async function startBot(scheduledTime, token, fetchImpl = fetch) {
  const claimsOnly = !hourlyWindow(scheduledTime);
  await dispatch(WORKFLOW, token, { ref: "main", inputs: { claims_only: String(claimsOnly) } }, fetchImpl);
}

// Returns false when this run is not the hourly one, so callers and tests can tell.
export async function startCilytics(scheduledTime, token, fetchImpl = fetch) {
  if (!hourlyWindow(scheduledTime)) return false;
  await dispatch(CILYTICS, token, { ref: "main" }, fetchImpl);
  return true;
}

export default {
  scheduled(controller, env, ctx) {
    // Separate promises: a Cilytics failure never stops the bot, and each error shows on its own.
    ctx.waitUntil(startBot(controller.scheduledTime, env.GITHUB_DISPATCH_TOKEN));
    ctx.waitUntil(startCilytics(controller.scheduledTime, env.GITHUB_DISPATCH_TOKEN));
  },
};
