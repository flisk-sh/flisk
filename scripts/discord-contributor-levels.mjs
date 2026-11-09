// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// The levels after a numbered contributor seat: a tier from merged PRs and a belt
// from the hardest rank:-labelled issue a person fixed. Each is a Discord role and a
// badge, the level last announced is kept with the seat, and a level never goes down.

export const INVITE = "https://discord.gg/qMu5Xn8Kaq";
export const MAINTAINER_PATH_PRS = 15;

// Lowest first. The thresholds match milestones in the merged-PR comment.
export const TIERS = [
  { name: "Regular", role: "Flisk Regular", at: 5, color: "38bdf8" },
  { name: "Core", role: "Flisk Core", at: 15, color: "06b6d4" },
  { name: "Veteran", role: "Flisk Veteran", at: 30, color: "8b5cf6" },
  { name: "Elite", role: "Flisk Elite", at: 50, color: "f59e0b" },
  { name: "Legend", role: "Flisk Legend", at: 100, color: "ef4444" },
];

export const BELTS = [
  { name: "White", role: "White Belt", ranks: "8-7 kyu", color: "e5e7eb" },
  { name: "Green", role: "Green Belt", ranks: "6-5 kyu", color: "22c55e" },
  { name: "Brown", role: "Brown Belt", ranks: "4-1 kyu", color: "a16207" },
  { name: "Black", role: "Black Belt", ranks: "dan", color: "18181b" },
];

export const levelRoleNames = () => [...TIERS, ...BELTS].map((level) => level.role);

export function tierFor(prs) {
  return TIERS.findLast((tier) => prs >= tier.at) ?? null;
}

function beltIndex(label) {
  const match = /^rank: (\d+) (kyu|dan)$/.exec(label);
  if (!match) return -1;
  if (match[2] === "dan") return 3;
  const kyu = Number(match[1]);
  if (kyu <= 4) return 2;
  return kyu <= 6 ? 1 : 0;
}

export function beltFor(labels) {
  const best = Math.max(-1, ...labels.map(beltIndex));
  return best < 0 ? null : BELTS[best];
}

// A lagging search index or a relabelled issue must not take a level away.
function higher(levels, computed, storedName) {
  const stored = levels.find((level) => level.name === storedName) ?? null;
  return levels.indexOf(stored) > levels.indexOf(computed) ? stored : computed;
}

function shield(label, message, color) {
  const params = new URLSearchParams({ label, message, color, labelColor: "07080f", style: "for-the-badge" });
  return `https://img.shields.io/static/v1?${params.toString().replaceAll("+", "%20")}`;
}

export function tierBadge(tier, login) {
  return shield(`FLISK ${tier.name.toUpperCase()}`, `${tier.at}+ merged PRs • @${login}`, tier.color);
}

export function beltBadge(belt, login) {
  return shield(`FLISK ${belt.name.toUpperCase()} BELT`, `${belt.ranks} • @${login}`, belt.color);
}

// Discord does not show SVG, and the PNG from raster.shields.io is only 28px tall, so it
// looks soft. This renders the same SVG at four times that height.
export function discordImage(badgeUrl) {
  return `https://wsrv.nl/?${new URLSearchParams({ url: badgeUrl, h: "112", output: "png" })}`;
}

const linked = (title, image) => `[![${title}](${image})](${INVITE})`;

export function levelUpMessage({ discordId, login, tier, belt, raisedTier, raisedBelt, prs }) {
  const news = [
    raisedTier ? `**${tier.role}** (${tier.at}+ merged PRs)` : "",
    raisedBelt ? `**${belt.role}** (${belt.ranks} issues)` : "",
  ].filter(Boolean);
  const raised = [raisedTier ? tier : null, raisedBelt ? belt : null].filter(Boolean);
  const snippets = raised.map((level) =>
    linked(`${level.role} @${login}`, level === tier ? tierBadge(tier, login) : beltBadge(belt, login)),
  );
  return [
    `🥋 <@${discordId}> levelled up to ${news.join(" and ")}, with ${prs} merged PR${prs === 1 ? "" : "s"} so far.`,
    "",
    `**Add it to your GitHub profile:**\n\`\`\`markdown\n${snippets.join("\n")}\n\`\`\``,
    `**For your CV:** \`${raised.map((level) => level.role).join(", ")}, Flisk (open source), flisk.sh\``,
  ].join("\n");
}

async function syncSeat(entry, { discord, github, entries, roleIds }) {
  const member = await discord.member(entry.discord);
  if (!member) return; // They left the server, so there is nobody to update or tell.
  const held = Object.values(roleIds).filter((id) => member.roles.includes(id));

  if (entry.revoked) {
    for (const id of held) await discord.revoke(entry.discord, id);
    return;
  }

  const work = await github.mergedWork(entry.github);
  // A seat needs a merged PR, so zero means the search cannot see PRs, not that they have none.
  if (work.prs === 0) throw new Error(`GitHub search found no merged PRs for ${entry.github}.`);
  const tier =higher(TIERS, tierFor(work.prs), entry.tier);
  const belt = higher(BELTS, beltFor(work.labels), entry.belt);

  const wanted = [tier, belt].filter(Boolean).map((level) => roleIds[level.role]);
  for (const id of held) if (!wanted.includes(id)) await discord.revoke(entry.discord, id);
  for (const id of wanted) if (!held.includes(id)) await discord.grant(entry.discord, id);

  const raisedTier = (tier?.name ?? null) !== (entry.tier ?? null);
  const raisedBelt = (belt?.name ?? null) !== (entry.belt ?? null);
  if (raisedTier || raisedBelt) {
    const images = [
      raisedTier ? discordImage(tierBadge(tier, entry.github)) : null,
      raisedBelt ? discordImage(beltBadge(belt, entry.github)) : null,
    ].filter(Boolean);
    await discord.announce(
      levelUpMessage({
        discordId: entry.discord,
        login: entry.github,
        tier,
        belt,
        raisedTier,
        raisedBelt,
        prs: work.prs,
      }),
      images,
      entry.discord,
    );
    if (tier) entry.tier = tier.name;
    if (belt) entry.belt = belt.name;
    await github.saveRegistry(entries);
  }

  if (work.prs >= MAINTAINER_PATH_PRS && !entry.maintainerFlagged) {
    await github.flagMaintainerCandidate(entry, work.prs, belt);
    entry.maintainerFlagged = true;
    await github.saveRegistry(entries);
  }
}

export async function syncLevels({ discord, github, log = console.log }) {
  const guild = await discord.guild();
  const roleIds = Object.fromEntries(
    levelRoleNames().map((name) => {
      const role = guild.roles.find((r) => r.name === name);
      if (!role) throw new Error(`The server has no role named ${name}.`);
      return [name, role.id];
    }),
  );

  const entries = await github.readRegistry();
  const ctx = { discord, github, entries, roleIds };
  let failed = 0;
  // One bad seat must not hold up everyone after it, and the run still goes red.
  for (const entry of entries) {
    try {
      await syncSeat(entry, ctx);
    } catch (error) {
      failed++;
      log(`::warning::Levels for seat ${entry.n} failed: ${error.message}`);
    }
  }
  log(`Synced levels for ${entries.length} seats.`);
  if (failed > 0) throw new Error(`${failed} of ${entries.length} seats failed.`);
}
