// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Starts the Discord badge bot every 3 minutes. GitHub's own schedule can go hours
// without firing, and contributors are told the bot answers within minutes.

const WORKFLOW = "https://api.github.com/repos/flisk-sh/flisk/actions/workflows/discord-founding-role.yml/dispatches";

// The hourly level sync is slow, so every other run only handles new claims. The timer fires on
// minutes divisible by 3, so exactly one run in the window from minute 17 on does the sync.
export const SYNC_MINUTE = 17;
export const RUN_EVERY_MINUTES = 3;

export async function startBot(scheduledTime, token, fetchImpl = fetch) {
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN is not set.");
  const minute = new Date(scheduledTime).getUTCMinutes();
  const claimsOnly = !(minute >= SYNC_MINUTE && minute < SYNC_MINUTE + RUN_EVERY_MINUTES);
  const response = await fetchImpl(WORKFLOW, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "flisk-discord-bot-trigger",
    },
    body: JSON.stringify({ ref: "main", inputs: { claims_only: String(claimsOnly) } }),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}: ${await response.text()}`);
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(startBot(controller.scheduledTime, env.GITHUB_DISPATCH_TOKEN));
  },
};
