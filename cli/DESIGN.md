# Flisk CLI Neon Design System v3.0
## Cyberpunk Terminal UI - Practical & Beautiful

```
╔══════════════════════════════════════════════════════════════════════╗
║  ▓▒░ Flisk NEON EDITION ░▒▓  │  /path/to/project  │  [ 36 services ]   ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  [1] OVERVIEW  [2] RESOURCES  [3] EVENTS  [4] FILES  [5] CONFIG     ║
║                                                                      ║
║  ┌─ Stacks ───────────────────────────┐  ┌─ Stack Details ───────┐   ║
║  │                                      │  │                        │   ║
║  │  ▸ order-planner (4 svcs)      │  │  api              │   ║
║  │    order (3 svcs)              │  │  5 services • Ready    │   ║
║  │  ▓▒░ api (5 svcs) ░▒▓          │  │                        │   ║
║  │    billing (1 svc)                   │  │  ├─ id-mgmt-backend    │   ║
║  │    platform (7 svcs)                 │  │  ├─ id-mgmt-frontend │   ║
║  │                                      │  │  ├─ id-sdk            │   ║
║  └──────────────────────────────────────┘  └────────────────────────┘   ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## DESIGN PHILOSOPHY

### Core Principle: "Neon Spotlight, Not Neon Flood"

**Wrong:** Everything glows = visual noise, user fatigue  
**Right:** Only important elements glow = clear hierarchy, comfortable use

**The 80/20 Rule:**
- 80% of UI: Clean, readable, neutral
- 20% of UI: Neon accents for focus points

### Three Principles

1. **Clarity First** — Information must be readable at a glance
2. **Restraint** — Neon effects are precious, use sparingly
3. **Graceful Degradation** — Works everywhere, shines where supported

---

## COLOR SYSTEM

### Primary Palette (Neon Accents - Used Sparingly)

| Color | Hex | Usage | ANSI Fallback |
|-------|-----|-------|---------------|
| **Neon Cyan** | `#00FFFF` | Selected items, active tab, headers | Cyan (`\x1b[36m`) |
| **Acid Green** | `#39FF14` | Healthy/ready status | Green (`\x1b[32m`) |
| **Neon Yellow** | `#FFFF00` | Warnings, pending | Yellow (`\x1b[33m`) |
| **Neon Red** | `#FF073A` | Errors, failed | Red (`\x1b[31m`) |
| **Hot Pink** | `#FF0080` | Highlights, emphasis | Magenta (`\x1b[35m`) |

### Neutral Palette (Workhorse Colors)

| Color | Hex | Usage | ANSI Fallback |
|-------|-----|-------|---------------|
| **Void Black** | `#0A0A0F` | Background | Default bg |
| **Panel Gray** | `#14141F` | Panels, cards | Black (`\x1b[40m`) |
| **Text White** | `#E0E0E0` | Primary text | White (`\x1b[37m`) |
| **Dim Gray** | `#6B7280` | Secondary text | Dark gray |
| **Border Gray** | `#374151` | Borders, dividers | Gray (`\x1b[90m`) |

### Where to Apply Neon (And Where NOT To)

✅ **USE Neon For:**
- Currently selected item (single element)
- Active tab only (not all tabs)
- Status indicators (ready/error/pending)
- Main header title
- Keyboard shortcut hints

❌ **NEVER Use Neon For:**
- Every border (creates visual noise)
- Inactive/unselected items
- Body text
- Background fills
- Decorative elements

---

## RESPONSIVE LAYOUT

### Breakpoints

| Width | Layout | Behavior |
|-------|--------|----------|
| **≥120 cols** | Full | Sidebar visible, full neon borders |
| **80-119 cols** | Compact | Sidebar visible, simplified borders |
| **60-79 cols** | Minimal | No sidebar, stacked tabs |
| **<60 cols** | Mobile | Single column, minimal chrome |

### Content Density by Size

```
Full (120+ cols):
┌────────────────────────────────────────────────────────────────────────────┐
│  ▓▒░ Flisk NEON ░▒▓  │  /path/to/project  │  36 services ready              │
│  [1] Overview  [2] Resources  [3] Events  [4] Files  [5] Config            │
│  ┌─ Stacks ──────────────────────┐  ┌─ Details ──────────────────────┐     │
│  │  api (5 services)        │  │  Name: api                  │     │
│  │  order (3 services)     │  │  Status: ✓ Ready                 │     │
│  │  platform (7 services)      │  │  Services: 5                     │     │
│  └───────────────────────────────┘  └──────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────────┘

Compact (80-119 cols):
┌────────────────────────────────────────────────────────┐
│  ▓▒░ Flisk ░▒▓  │  /path/to/project  │  36 svcs ready   │
│  [1]Overview [2]Resources [3]Events [4]Files [5]Config  │
│  ┌─ Stacks ───────────────────┐  ┌─ Details ───────┐   │
│  │  api (5 svcs)          │  │  api       │   │
│  │  order (3 svcs)     │  │  ✓ Ready        │   │
│  └─────────────────────────────┘  └─────────────────┘   │
└────────────────────────────────────────────────────────┘

Mobile (<80 cols):
┌─────────────────────────────────┐
│  ▓▒░ Flisk ░▒▓ │ 36 svcs ready    │
│  [1][2][3][4][5]                │
│  ┌─ Stacks ───────────────────┐
│  │  api (5 svcs)          │
│  │  ▸ order (3 svcs)     │
│  │  platform (7 svcs)         │
│  └───────────────────────────────┘
│  ┌─ Details ───────────────────┐
│  │  api                   │
│  │  ✓ Ready                   │
│  │  5 services                 │
│  └───────────────────────────────┘
└─────────────────────────────────┘
```

---

## COMPONENTS

### 1. Header

```
Minimal (Best):
╔══════════════════════════════════════════════════════════════════════╗
║  ▓▒░ Flisk NEON EDITION ░▒▓  │  /path/to/project  │  [ 36 services ]   ║
╚══════════════════════════════════════════════════════════════════════╝

Rules:
- One neon accent: the title "▓▒░ Flisk NEON EDITION ░▒▓"
- Everything else: neutral colors
- Height: 1 row
- Separator: Single line (not double, not neon border)
```

### 2. Tab Bar

```
Correct (Restrained):
╔══════════════════════════════════════════════════════════════════════╗
║  [1] ▓▒░OVERVIEW░▒▓  [2] Resources  [3] Events  [4] Files  [5] Config ║
╚══════════════════════════════════════════════════════════════════════╝

Wrong (Too Much):
▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░
▒▓  [1]  ▓▒░ OVERVIEW ░▒▓  [2] RESOURCES  [3] EVENTS  ...           ▓▒
▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░

Rules:
- Only the ACTIVE tab gets neon treatment
- Inactive tabs: plain text with bracket hints
- No outer borders (wastes space, adds noise)
- Compact: abbreviate labels if needed ("Overview" → "Overvw")
```

### 3. Stack List

```
Correct:
┌─ Stacks ───────────────────────────┐
│                                      │
│  order-planner (4 svcs)        │
│  order (3 svcs)                │
│  ▓▒░ api (5 svcs) ░▒▓          │  ← Only selected has neon
│  billing (1 svc)                     │
│  platform (7 svcs)                   │
│                                      │
└──────────────────────────────────────┘

Wrong:
┌▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░┐
│▒▓                                  ▓▒│
│▓▒  order-planner (4 svcs)   ▒▓│
│▒▓  order (3 svcs)           ▓▒│
│▓▒  ▓▒░ api (5 svcs) ░▒▓     ▒▓│
│▒▓  billing (1 svc)                 ▓▒│
│▓▒                                  ▒▓│
│▒▓  order-planner (4 svcs)  ▓▒│
└▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒┘

Rules:
- Simple box border (┌─┐│└┘)
- Only the selected item gets neon background/text
- Others: plain white on panel gray
- Selected indicator: ► or ▸, not full border
```

### 4. Status Indicators

```
Ready:     ✓  acid green    (not neon, just green)
Pending:   ◐  yellow        (spinning if animated)
Error:     ✗  red           (subtle pulse)
Building:  ◉  orange/yellow (rotating)
Unknown:   ?  gray           (dim, not attention-grabbing)

Correct:
api-backend      backend    ✓ ready      (green, simple)
api-frontend     frontend   ◐ pending    (yellow, spinning)
api-sdk          sdk        ✗ error      (red, subtle)

Wrong:
api-backend      backend    ▓▒░✓▓▒░ READY ▓▒░   (overdone)
api-frontend     frontend   ▓▒░◐▓▒░ PENDING ▓▒░ (overdone)
```

### 5. Detail Panel (Sidebar)

```
Correct:
┌─ api ─────────────────────┐
│                                │
│  Name: api                │
│  Services: 5                   │
│  Status: ✓ Ready             │
│                                │
│  Services:                     │
│  ├─ id-mgmt-backend            │
│  ├─ id-mgmt-frontend           │
│  ├─ id-sdk                     │
│  ├─ introvertic-infra          │
│  └─ product-introvertic-ui     │
│                                │
│  [Esc] Close                   │
└────────────────────────────────┘

Wrong:
┌▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░┐
│▒▓                          ▓▒│
│▓▒  [ STACK : api ]   ▒▓│
│▒▓                          ▓▒│
│▓▒  Name: api          ▒▓│
│▒▓  Status: ▓▒░✓▓▒░▓▒░     ▓▒│
│▓▒                          ▒▓│
└▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒┘

Rules:
- Simple box border
- Status indicator gets color, nothing else
- Text: white/gray, not neon
- Close hint: subtle, bottom-aligned
```

---

## ANIMATION SYSTEM

### Animation Principles

1. **Purposeful** — Every animation guides attention
2. **Fast** — <200ms for feedback, <500ms for transitions
3. **Optional** — Respect `NO_ANIMATIONS` preference

### Animation Types

#### 1. Selection Pulse (150ms)

```
Selected item gets a quick cyan flash:

Frame 1 (0ms):     api (5 svcs)      ← normal
Frame 2 (50ms):    ▓▒░api▓▒░         ← flash bright
Frame 3 (100ms):   ▓▒░api▓▒░         ← hold
Frame 4 (150ms):   ▓▒░api (5 svcs)    ← back to normal with neon bg
```

Timing:
- **Easing**: Ease-out (fast start, slow end)
- **Duration**: 150ms total
- **Trigger**: User selects item (click or Enter)

#### 2. Status Spinners (800ms loop)

```
Pending indicator ◐ rotates:

Frame 1:    ◐    (0ms)
Frame 2:    ◓    (100ms)
Frame 3:    ◑    (200ms)
Frame 4:    ◒    (300ms)
Frame 5:    ◐    (400ms) ← back to start
```

Timing:
- **Duration**: 800ms loop
- **Easing**: Linear (smooth continuous)
- **Trigger**: Service status is "pending" or "building"

#### 3. Error Pulse (1000ms loop)

```
Error status ✗ pulses subtly:

Frame 1 (0ms):      ✗ error      (red, normal)
Frame 2 (250ms):    ✗ error      (red, 20% brighter)
Frame 3 (500ms):    ✗ error      (red, normal)
Frame 4 (750ms):    ✗ error      (red, 20% brighter)
```

Timing:
- **Duration**: 1000ms loop
- **Easing**: Sine wave (smooth pulse)
- **Trigger**: Service status is "error"

#### 4. Tab Switch (100ms)

```
Tab switches with quick fade:

Frame 1 (0ms):    [1] ▓▒░OVERVIEW░▒▓  [2] Resources  ← old active
Frame 2 (50ms):   [1] Overview        [2] ▓▒░RESOURCES▓▒░  ← transition
Frame 3 (100ms):  [1] Overview        [2] ▓▒░RESOURCES▓▒░  ← new active
```

Timing:
- **Duration**: 100ms
- **Easing**: Instant (no tweening needed)
- **Trigger**: User switches tabs

### Animation Disable Option

```bash
# Disable for slow connections or user preference
flisk ui --no-animations
# or
NO_ANIMATIONS=1 flisk ui
```

When disabled:
- Spinners show static icon
- Pulses are instant (no fade)
- All timing becomes 0ms (immediate)

---

## ACCESSIBILITY

### Color Blindness Support

**Problem:** Red/green status indicators are invisible to 8% of males

**Solution:** Use BOTH color AND symbol

```
Correct (Color + Shape):
✓ ready      (green + checkmark)
✗ error      (red + X)
◐ pending    (yellow + spinning circle)

Wrong (Color Only):
● ready      (just green dot)
● error      (just red dot)
```

### High Contrast Mode

```bash
# For visually impaired users
flisk ui --high-contrast
# or
HIGH_CONTRAST=1 flisk ui
```

Changes in high contrast:
- Neon → Pure primary colors (bright cyan, not subtle)
- Background → Pure black (#000000)
- Text → Pure white (#FFFFFF)
- No gradients, no dim colors

### Keyboard Navigation (Always Supported)

```
Tab Order:
1. Tab bar (arrow keys to switch tabs)
2. List items (↑/↓ to navigate, Enter to select)
3. Detail panel (if visible)
4. Status bar (shortcuts)

Focus Indicators:
- Focused element: Cyan border + underline
- Unfocused: No special styling
```

### Screen Reader Support

```
ARIA Labels for terminal (via text hints):

Before:
  ▸ api (5 services)

After:
  [SELECTED] api, 5 services, stack, press Enter to view details

Implementation:
- Prefix selected items with [SELECTED]
- Add context hints in brackets
- Keep main text clean
```

---

## ERROR & EDGE STATES

### 1. No Services Found

```
╔══════════════════════════════════════════════════════════════════════╗
║  ▓▒░ Flisk NEON EDITION ░▒▓                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─ No Services Found ──────────────────────────────────────────────┐
║  │                                                                   │
║  │  ◉ No service.json files found in this directory                 │
║  │                                                                   │
║  │  To get started:                                                  │
║  │    1. Run: flisk init                                              │
║  │    2. Or create services manually                                │
║  │                                                                   │
║  │  [Press 'q' to quit]                                              │
║  │                                                                   │
║  └───────────────────────────────────────────────────────────────────┘
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Design Notes:**
- Icon: ◉ (warning circle, not neon)
- Color: Yellow (attention, not alarm)
- CTA: Clear next steps

### 2. Connection Error

```
╔══════════════════════════════════════════════════════════════════════╗
║  ▓▒░ Flisk NEON EDITION ░▒▓                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─ Connection Error ────────────────────────────────────────────────┐
║  │                                                                   │
║  │  ✗ Cannot connect to Tilt daemon                                 │
║  │                                                                   │
║  │  Troubleshooting:                                                  │
║  │    1. Is Tilt running? Run: tilt up                                │
║  │    2. Check Tiltfile exists in current directory                  │
║  │    3. Try: flisk status --verbose                                   │
║  │                                                                   │
║  │  [Press any key to retry]                                         │
║  │                                                                   │
║  └───────────────────────────────────────────────────────────────────┘
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Design Notes:**
- Icon: ✗ (error X, red)
- Color: Red for error state
- CTA: Multiple troubleshooting options

### 3. Loading State

```
╔══════════════════════════════════════════════════════════════════════╗
║  ▓▒░ Flisk NEON EDITION ░▒▓                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─ Loading System ──────────────────────────────────────────────────┐
║  │                                                                   │
║  │  [ ◐ ] Discovering services...                                    │
║  │       ████████████████████░░░░░░░  67%                            │
║  │                                                                   │
║  │  [ ◉ ] Found: 14 stacks, 36 services                              │
║  │                                                                   │
║  │  [   ] Initializing UI...                                         │
║  │                                                                   │
║  └───────────────────────────────────────────────────────────────────┘
║                                                                      ║
║       [Press 'q' to cancel]                                          ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Design Notes:**
- Spinner: ◐ (rotating)
- Progress bar: Cyan fill on gray bg
- Steps: Show completed, current, pending
- Cancel option: Always available

### 4. Empty Stack (No Services in Stack)

```
┌─ ghost-stack ──────────────────────┐
│                                     │
│  ◉ No services assigned to this    │
│    stack yet                        │
│                                     │
│  To add services:                   │
│    1. Edit service.json             │
│    2. Add: "stack": "ghost-stack"   │
│                                     │
└─────────────────────────────────────┘
```

### 5. Timeout Error

```
┌─ Request Timeout ───────────────────┐
│                                     │
│  ✗ No response from Tilt (30s)     │
│                                     │
│  Possible causes:                   │
│  • Tilt is overloaded               │
│  • Network latency                  │
│  • Resource is stuck                │
│                                     │
│  [r] Retry  [s] Skip  [q] Quit      │
│                                     │
└─────────────────────────────────────┘
```

---

## TERMINAL COMPATIBILITY

### Feature Detection

```typescript
// Detect terminal capabilities
const capabilities = {
  // True color (24-bit) support
  trueColor: process.env.COLORTERM === 'truecolor' || 
             process.env.TERM === 'xterm-256color',
  
  // Unicode support
  unicode: process.env.LANG?.includes('UTF-8') !== false,
  
  // Animation support (not in CI, not in dumb terminal)
  animations: !process.env.CI && 
            process.env.TERM !== 'dumb' &&
            !process.env.NO_ANIMATIONS,
  
  // Mouse support
  mouse: process.stdout.isTTY && 
         !process.env.NO_MOUSE,
};
```

### Fallback Strategy

| Feature | Full Support | Fallback |
|---------|--------------|----------|
| **True Color** | 24-bit neon | 256-color approx |
| **Unicode** | ▓▒░ borders | ASCII +-\| |
| **Animations** | 150ms fades | Instant |
| **Mouse** | Click support | Keyboard only |
| **Bold** | Bold + bright | Bright only |

### 256-Color Fallback Palette

```typescript
// When true color isn't available
const FALLBACK_256 = {
  cyan: '\x1b[38;5;51m',      // Closest to #00FFFF
  green: '\x1b[38;5;82m',    // Closest to #39FF14
  yellow: '\x1b[38;5;226m',   // Closest to #FFFF00
  red: '\x1b[38;5;196m',     // Closest to #FF073A
  pink: '\x1b[38;5;198m',    // Closest to #FF0080
  purple: '\x1b[38;5;129m',  // Closest to #BF00FF
};
```

### 16-Color Fallback (Basic Terminals)

```typescript
// For basic terminals (like Windows CMD without ANSI)
const FALLBACK_16 = {
  cyan: '\x1b[36m',     // ANSI cyan
  green: '\x1b[32m',    // ANSI green
  yellow: '\x1b[33m',    // ANSI yellow
  red: '\x1b[31m',      // ANSI red
  pink: '\x1b[35m',     // ANSI magenta (closest)
  purple: '\x1b[35m',    // ANSI magenta
  white: '\x1b[37m',    // ANSI white
  gray: '\x1b[90m',     // ANSI bright black
};
```

### ASCII Fallback (No Unicode)

```
Full Unicode:
▓▒░ Flisk ░▒▓  │  api (5 svcs)  │  ✓ ready

ASCII Fallback:
[ Flisk ]  |  api (5 svcs)  |  [OK] ready

Border Unicode:
┌─ Stacks ─┐
│ api │
└──────────┘

Border ASCII:
+- Stacks --+
| api |
+----------+
```

---

## PERFORMANCE GUIDELINES

### Rendering Rules

1. **Max 60 FPS** — Don't exceed terminal capabilities
2. **Throttle Resize** — Debounce resize events (100ms)
3. **Limit Re-renders** — Use memoization for static content
4. **Lazy Load** — Only render visible items

### Memory Budget

- **Max 50MB** — For full UI with 100+ services
- **Clean up on exit** — Always restore terminal state
- **No memory leaks** — Remove all listeners on unmount

### Network/IO

- **Debounce file watchers** — 100ms minimum
- **Cache metadata** — 5 second TTL
- **Background refresh** — Don't block UI

---

## IMPLEMENTATION CHECKLIST

### Visual Design
- [ ] Header uses single neon accent
- [ ] Only active tab has neon
- [ ] Only selected item has neon background
- [ ] Status icons use color + symbol
- [ ] Simple borders (not neon borders everywhere)
- [ ] Responsive layout works at 80+ cols

### Animations
- [ ] Selection pulse: 150ms
- [ ] Tab switch: 100ms
- [ ] Spinner: 800ms loop
- [ ] Error pulse: 1000ms loop
- [ ] All animations can be disabled

### Accessibility
- [ ] Keyboard navigation works
- [ ] Color blind safe (symbols + colors)
- [ ] High contrast mode available
- [ ] Screen reader hints included

### Compatibility
- [ ] True color detection
- [ ] 256-color fallback
- [ ] 16-color fallback
- [ ] ASCII fallback for borders
- [ ] Mouse optional (keyboard always works)

### Error States
- [ ] No services found state
- [ ] Connection error state
- [ ] Loading state with progress
- [ ] Empty stack state
- [ ] Timeout state

---

## DESIGN DECISIONS LOG

| Decision | Alternatives | Rationale |
|----------|--------------|-----------|
| ▓▒░ for selected only | Border every item | Reduces visual noise |
| Simple borders | Neon borders everywhere | Cleaner, more professional |
| Single header row | Ornate multi-row header | Saves space for content |
| 5 tabs max | More tabs with scrolling | 80-col minimum support |
| Cyan primary | Pink or green | Cyan is most visible on dark bg |
| Spinners on status only | Spinners everywhere | Focuses attention |

---

## SUMMARY

**The Golden Rules:**

1. **Neon is a spotlight, not a floodlight**
2. **Clarity beats decoration**
3. **Works everywhere, shines where supported**
4. **Accessibility is not optional**
5. **Performance is a feature**

**Before/After Comparison:**

```
BEFORE (Visual Overload):
▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░
▒▓  EVERYTHING GLOWS  ▓▒
▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░▓▒░

AFTER (Restrained & Clear):
┌─ Stacks ───────────────────┐
│  api (5 svcs)         │
│  ▓▒░ billing (1 svc) ░▒▓  │ ← Only selected glows
│  platform (7 svcs)         │
└────────────────────────────┘
```

**This is the Flisk Neon Edition: Beautiful, Practical, Accessible.**

---

**DESIGN SYSTEM v3.0**  
**Practical Cyberpunk for Real Terminals**
