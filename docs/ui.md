# `flisk ui` key bindings

`flisk ui` opens an interactive terminal dashboard for the running stack. The keys below are the ones the dashboard handles.

| Key | Does |
|---|---|
| `1`–`5` | Jump to Overview, Resources, Events, Files, Config |
| `Tab` / `Shift+Tab` | Next / previous tab |
| `↑`/`↓` or `j`/`k` | Move the highlight |
| `g` / `G`, `Home` / `End` | First / last item |
| `PgUp` / `PgDn` | Move one page |
| `Enter` or `Space` | Open the highlighted stack, service or file |
| `Esc` | Back one level (file → service → stack). On the top screen it only shows "Press q to quit" |
| `/` | Search. `Enter` keeps the filter, `Esc` clears it |
| `r` | Refresh. On Events it reloads events |
| `e` | Toggle enabled-only and all services |
| `t` | Toggle footer tooltips |
| `m` | Toggle mouse support |
| `?` | Show the help panel. Any key closes it |
| `q` | Quit |

## Flags

- `--no-animations`: disable animations (static spinner text).
- `--high-contrast`: enable high-contrast colours.

## ASCII mode

`flisk ui` switches to plain ASCII on its own when the environment asks for no colors:

- `NO_COLOR` is set, even to an empty value, or
- `TERM` starts with `dumb` (any letter case).

In ASCII mode there are no colors, no boxes around panels, and `--high-contrast` has no effect. Everything that was a symbol becomes text:

| Where | Normal | ASCII |
|---|---|---|
| Banner and selected-row marker | `▓▒░` (end: `░▒▓`) | `>>>` (end: `<<<`) |
| Separator between footer items | ` │ ` | ` \| ` |
| Horizontal rules | `─` | `-` |
| Section heading | `┌─ Resources ─` | `[ Resources ]` |
| Stack and service title | `┌─ NAME ─┐` | `--- NAME ---` |
| Status: healthy, in progress, failed, unknown | `✓` `○` `✗` `?` | `[+]` `[~]` `[x]` `[?]` |
| Services under a stack | `├─ ` and `└─ ` | `\|- ` and `L- ` |
| Folder open, closed (Files tab) | `▼` `▶` | `[-]` `[+]` |
| File types: Docker, Tilt, config, Prisma, generated, other | emoji | `[D]` `[T]` `[C]` `[P]` `[G]` `[?]` |
| Overview counts: in a stack, no stack | `●` `○` | `[+]` `-` |
| Footer toggles | `🖱️` `ℹ️` `✓ enabled` (or `✓ all`) | `Mouse` `Info` `[+] enabled` (or `[+] all`) |
| Tooltip prefix | `ℹ ` | `[i] ` |
| Loading spinner | braille dots | `-` `/` `\|` `\` |
| Error mark, empty-state mark | `✗` `◉` | `[x]` `[*]` |
| Arrow keys in key hints | `↑/↓` | `UP/DOWN` |

To try it, run `NO_COLOR=1 flisk ui`. The same behavior is described in [`cli/README.md`](../cli/README.md).

## Events tab

The Events tab reads from Tilt, so Tilt must be running. If it is not, the tab shows "Tilt is not running or its UI is unreachable" and suggests `flisk up`. Press `r` on that tab to retry.
