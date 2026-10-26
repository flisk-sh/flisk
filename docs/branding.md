# Flisk branding

Visual identity and voice for Flisk. Derived from the README first look: one command takes an empty folder to a running stack, built for agents, local-only by default.

## Positioning

- **What it is:** a CLI that runs your whole local stack (Docker, Tilt, generated config) with one command.
- **Who it is for:** developers who build multi-service apps and agent systems, and the coding agents that work with them.
- **The promise:** from an empty folder to a running stack, without setup pain.

## Voice

- Plain and direct. Say what happens: "Run `flisk up`. Your services start."
- Concrete over clever. Use real numbers and commands from the product ("about 14 seconds").
- No hype words, no apologies in errors. An error says what failed and how to fix it.

## Color

Dark-first, built on the colors already in the repo's SVG assets.

| Token | Hex | Use |
| --- | --- | --- |
| `--flisk-signal` | `#61f0d3` | Accent: the one bright thing on a screen (CTA, active state, key figure) |
| `--flisk-ink` | `#0c1417` | Dark background |
| `--flisk-slate` | `#1b2a30` | Raised surfaces, terminal panels |
| `--flisk-mist` | `#71717a` | Secondary text (zinc, cool-tinted) |
| `--flisk-paper` | `#f4f7f6` | Light background and primary text on dark |

Rules:
- The signal teal is the only accent. Do not add a second brand hue.
- Semantic colors (success, warning, error) stay separate from the accent.
- Text on the signal color must be `--flisk-ink`, not white (contrast).

## Typography

- **Display:** IBM Plex Sans, 600 weight, tight tracking. Headings use `text-wrap: balance`.
- **Body:** IBM Plex Sans, 400 weight, 1.6 line height, about 65 characters per line.
- **Code and CLI:** JetBrains Mono. Commands, paths and terminal output always use it.

Fallback stack for every face: `system-ui, -apple-system, Segoe UI, sans-serif` (and `ui-monospace, Menlo, monospace` for code).

## Logo and mark

- **Wordmark:** "flisk" in lowercase, display weight, with the signal teal on a single dot or stroke.
- **Mark direction:** a small set of connected nodes (services) joined by one line (the stack coming up). Use it at 16px for favicons and at full size for headers.
- Keep clear space equal to the height of the "f" on all sides.
- Never place the mark on the signal color, and never stretch it.

## Visual motifs

- Terminal panels as the main image. Show real `flisk` output, not mock dashboards.
- Status as form: a teal dot for running, a plain outline for stopped.
- Diagrams show the stack as nodes and arrows, using the same palette.

## Design skills

The repo's own design guidance and the session's design skills cover the rest:
- `artifact-design` for HTML pages and brand sheets.
- `dataviz` for charts and status tiles.
- `artifact-diagramming` for stack and topology diagrams.

Reference page: [`docs/design/brand-sheet.html`](design/brand-sheet.html).
