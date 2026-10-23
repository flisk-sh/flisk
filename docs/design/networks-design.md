# Flisk Networks Command Design

## Overview
Display Traefik-routed URLs for all services in a clean, modern CLI format.

## Design Principles

### 1. Visual Hierarchy
- Header with clear title and domain info
- Group by stack with emoji indicators
- Service name left-aligned, URL right-aligned
- Status indicators (emoji) for quick scanning

### 2. Layout
```
┌─────────────────────────────────────────────────────────┐
│  🌐  TRAEFIK NETWORKS                                    │
│  Domain: {project}.localhost                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🔐 IDENTITY STACK                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🟢 api-api           localhost:4004 → /api/api │
│  🟢 api-app           localhost:3000 → /api     │
│                                                          │
│  📅 ORDER STACK                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🟢 order-api        localhost:4001 → /order│
│  🟢 order-app        localhost:3001 → /orders│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. Color Scheme
- **Header**: Cyan background, white bold text
- **Stack names**: White bold with colored emoji
- **Service names**: Gray/white
- **URLs**: Cyan (clickable terminals will underline)
- **Status**: 
  - 🟢 Green (running)
  - 🔴 Red (stopped)
  - ⚪ Gray (unknown)

### 4. Alignment
- Stack headers: Left-aligned, bold
- Separator line: Full width (━ character)
- Service name: Left-aligned, 24 chars max
- Arrow separator: "→" in gray
- URL: Left-aligned, cyan color

### 5. Data Display
```typescript
interface DisplayRow {
  status: '🟢' | '🔴' | '⚪'
  serviceName: string      // 24 chars max
  separator: '→'
  port?: string           // localhost:PORT or internal:PORT
  path: string            // /service-path
  fullUrl: string         // http://domain/path
}
```

### 6. Terminal Width
- Fixed width: 60 characters
- Truncate service names at 24 chars
- URL always clickable (http://...)

### 7. Features
- Clickable URLs (plain http:// format)
- Grouped by stack
- Status indicators
- Clean separation between stacks

## Implementation Notes

1. Use chalk for colors
2. No ANSI escape codes for hyperlinks (causes issues)
3. Plain http:// URLs are auto-detected by modern terminals
4. Pad service names to align arrows
5. Use box-drawing characters for clean borders
