# Tilt IDE Components

Web-based IDE features integrated into the Flisk Landscape Tilt development environment.

## Overview

The Tilt IDE provides browser-based tools for browsing, viewing, and executing code without leaving the Tilt UI.

| Component | Port | Traefik URL | Direct URL |
|-----------|------|-------------|------------|
| **File Browser** | 9765 | http://files.localhost | http://localhost:9765 |
| **Code Viewer** | 9766 | http://viewer.localhost | http://localhost:9766 |
| **Config Inspector** | 9767 | http://configs.localhost | http://localhost:9767 |
| **Code Executor** | 9768 | http://terminal.localhost | http://localhost:9768 |

> **Note:** `code_executor` is not shipped in the npm package or started by `tilt up` (see #826). Its source stays in the repository.

## Quick Start

All components start automatically when you run `tilt up`:

```bash
# Start Tilt (IDE components auto-start)
tilt up

# Or start with focus
tilt up --focus staff

# IDE components are always available regardless of focus mode
```

Then open in your browser:
- 📁 **File Browser**: http://files.localhost (or http://localhost:9765)
- 👁️ **Code Viewer**: http://viewer.localhost (or http://localhost:9766)
- ⚙️ **Config Inspector**: http://configs.localhost (or http://localhost:9767)
- 💻 **Terminal**: http://terminal.localhost (or http://localhost:9768)

## Components

### File Browser (Port 9765)

Browse the entire monorepo filesystem from your browser.

**Features:**
- Directory tree navigation
- File metadata (size, modified time)
- File type icons
- Search across all files
- Click any file to open in Code Viewer

**Usage:**
1. Navigate to http://files.localhost
2. Click directories to navigate deeper
3. Use breadcrumb to go back up
4. Click files to view in Code Viewer (new tab)
5. Use search box to find files by name

### Code Viewer (Port 9766)

View source files with syntax highlighting.

**Features:**
- Syntax highlighting for TypeScript, Starlark, JSON, YAML, Prisma, and more
- Line numbers
- Read-only indicator
- File size and modification info

**Usage:**
1. Open directly: http://viewer.localhost?file=services/product/staff/staff-management-backend/src/index.ts
2. Or click files from File Browser
3. Supports files up to 1MB

### Config Inspector (Port 9767)

Compare master Tilt configurations (.star files) with their auto-generated outputs.

**Features:**
- Browse all .star config files organized by category
- Side-by-side comparison of master vs generated
- One-click "Regenerate" action (coming soon)

**Usage:**
1. Navigate to http://configs.localhost
2. Select a .star file from the sidebar
3. View master config on left, generated outputs on right
4. Click "Regenerate" to trigger config regeneration

### Code Executor (Port 9768)

Execute bun commands from the browser.

**Features:**
- Terminal interface in browser
- Command history (up/down arrows)
- Real-time output with color coding
- Safety restrictions (no rm -rf /)
- Supports: bun, npm, git, and safe shell commands

**Usage:**
1. Navigate to http://terminal.localhost
2. Type commands like `bun test`, `ls -la`, `git status`
3. Press Enter to execute
4. Use Up/Down arrows to recall previous commands

## Architecture

Each component is a Python HTTP server:

```
.tilt-engine/extensions/ide-components/
├── file_browser/
│   └── server.py          # Port 9765
├── code_viewer/
│   └── server.py          # Port 9766
├── config_inspector/
│   └── server.py          # Port 9767
├── code_executor/
│   └── server.py          # Port 9768
└── shared/
    ├── file_utils.py      # Safe file operations
    ├── templates/
    │   └── base.html      # Common HTML template
    └── static/
        └── styles.css     # Shared CSS styles
```

### Key Design Decisions

1. **Python (not Bun/Node)**: Avoids circular dependency - IDE works even if Bun has issues
2. **Separate servers**: Each component is independent, can restart individually
3. **Read-only viewer**: Safety first - editing happens in proper IDEs
4. **localhost only**: Security - not exposed to network

## Safety

### File Access
- ✅ Only reads within project root
- ✅ Blocks path traversal attacks (../etc/passwd)
- ✅ 1MB file size limit
- ✅ Hidden files excluded from browser

### Command Execution
- ✅ Only bun, npm, git, and safe shell commands allowed
- ✅ Blocks: rm -rf /, sudo, su, passwd, etc.
- ✅ 60-second timeout on commands
- ✅ Commands run in project directory only

## Troubleshooting

### Port Already in Use

If you see "Address already in use":

```bash
# Find what's using the port
lsof -i :9765  # or 9766, 9767, 9768

# Kill the process
kill -9 <PID>
```

### Components Not Starting

Check the Tilt logs:

```bash
# View specific component logs
tilt logs tilt-file-browser
tilt logs tilt-code-viewer
tilt logs tilt-config-inspector
tilt logs tilt-code-executor
```

### Python Not Found

Ensure Python 3 is installed:

```bash
python3 --version

# On macOS (if needed)
brew install python3
```

## Future Enhancements

- [ ] Service context actions (View Source, Run Tests) in Tilt UI
- [ ] Regenerate button that actually triggers `tilt trigger`
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts (Ctrl+K for search)
- [ ] File type icons (font-based)
- [ ] Mobile responsiveness
- [ ] VS Code extension integration

## Development

To work on IDE components:

```bash
# Test file browser standalone
cd .tilt-engine/extensions/ide-components/file_browser
python3 server.py

# Test code viewer standalone
cd .tilt-engine/extensions/ide-components/code_viewer
python3 server.py
```

Then open http://localhost:9765 (or 9766, etc.) in your browser.

## Integration with Alpha Health Dashboard

The IDE components work alongside the alpha health dashboard:

- **Health Dashboard**: http://localhost:8765/alpha-health-dashboard.html
- **File Browser**: http://files.localhost
- **Code Viewer**: http://viewer.localhost
- **Config Inspector**: http://configs.localhost
- **Terminal**: http://terminal.localhost

All components run independently and can be used simultaneously.
