# Discord bot trigger

A Cloudflare Worker that starts the [Discord badge bot](../../.github/workflows/discord-founding-role.yml) every 3 minutes. GitHub's own schedule can go hours without firing, and contributors are told the bot answers within a few minutes.

Every run handles new claims. The first run from minute 17 of each hour also runs the level sync. The Worker only dispatches; the Discord work stays in GitHub Actions, so the Worker stays far from its daily limits.

## Set up

Deploy from this folder:

```bash
npx wrangler@4 deploy
```

Then create a fine-grained GitHub token limited to `flisk-sh/flisk` with **Actions: Read and write**, and store it:

```bash
npx wrangler@4 secret put GITHUB_DISPATCH_TOKEN
```

The token expires, and the bot stops being started when it does. Replace it the same way. Worker errors appear in the Cloudflare dashboard under this Worker's logs.
