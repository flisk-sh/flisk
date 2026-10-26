# Lab 2: Create a project

**Goal:** turn an empty folder into a Flisk project.
**Time:** 5 minutes. **Previous:** [Lab 1](01-check-your-machine.md). **Next:** [Lab 3](03-add-an-api.md).

You will build a small shop called `my-shop` across the labs. Work in the same folder every time.

## Steps

1. Make a folder and enter it:

   ```bash
   mkdir my-shop && cd my-shop
   git init
   ```

2. Create the project:

   ```bash
   flisk project --yes
   ```

   `--yes` accepts the defaults, so there are no questions.

3. Look at what appeared:

   ```bash
   ls -a
   ```

## You should see

Flisk prints each step. The lines that matter:

```text
✓ Created: .flisk/project.json
✓ Created: .env (the defaults work as-is)
✓ Added to .gitignore: .env, .flisk/.flisk-out/, .flisk/.project-id, .flisk/smoke/, node_modules/

✅ Project configuration complete!

Next steps:
  1. flisk resource api --type backend --stack app   # scaffold a service
  2. flisk up app                                     # start it
```

## What just happened

| What | Where | Who edits it |
| --- | --- | --- |
| Project settings | `.flisk/project.json` | You |
| Generated runtime files (the Tiltfile, gateway, base image) | `.flisk/.flisk-out/` | Flisk. Do not edit. |
| Secrets, with a random database password and a random login secret | `.env` | You can, but the defaults work. It is git-ignored. |
| Database setup | `services/platform/database-management/docker-compose.yml` | Flisk |

Your secrets are in `.env`, and Flisk added `.env` to `.gitignore` so it is not committed.

Nothing is running yet. Flisk only prepared files.

## Ask your AI agent instead

```text
In an empty folder called my-shop, create a Flisk project with flisk project --yes, then explain what each new file and folder is for.
```

## Checkpoint

- [ ] `.flisk/project.json` exists.
- [ ] `.env` exists and `git status` does not list it.
- [ ] You can say which folder holds generated files and why you should not edit it.

## Stuck?

- **`NOT_IN_PROJECT` later on:** you are in the wrong folder. Go back to `my-shop`.
- **You want a different folder layout:** see [layout](../layout.md).
