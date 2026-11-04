# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# NATIVE WINDOWS HELPERS FOR DISCOVERY
# =============================================================================
# On Linux, macOS and WSL2, discovery runs POSIX tools (sh, find, test, mkdir)
# through local(). cmd.exe and PowerShell have none of them, so on native
# Windows (os.name == "nt") the same questions are answered with Tilt's own
# Starlark built-ins (os.path.exists, listdir) or, where a file must be written,
# with PowerShell. Call sites keep their POSIX command unchanged and branch on
# IS_NATIVE_WINDOWS, so nothing changes off Windows.
#
# Not verified on a real Windows machine; see docs/design/native-windows-runtime-decision.md.
# =============================================================================

# FLISK_DISCOVERY_PORTABLE=1 forces the portable code path off Windows so CI can compare it with the POSIX one.
IS_NATIVE_WINDOWS = os.name == "nt" or os.getenv("FLISK_DISCOVERY_PORTABLE") == "1"

def _slash(path):
    return path.replace("\\", "/")

def _star_closure(pattern, states):
    # A * may match nothing, so from a state sitting on * the next state is reachable too.
    out = dict(states)
    for _ in range(len(pattern) + 1):
        for i in list(out.keys()):
            if i < len(pattern) and pattern[i] == "*":
                out[i + 1] = True
    return out

def _glob_match(pattern, text):
    """Shell-style match of one path segment: * matches any run, ? matches one character."""
    states = _star_closure(pattern, {0: True})
    for c in text.elems():
        nxt = {}
        for i in states.keys():
            if i >= len(pattern):
                continue
            if pattern[i] == "*":
                nxt[i] = True
            elif pattern[i] == "?" or pattern[i] == c:
                nxt[i + 1] = True
        states = _star_closure(pattern, nxt)
    return len(pattern) in states

def _is_file(path):
    """True for a regular file. os.path.exists is also true for directories and read_file fails on them, so ask the parent."""
    if not os.path.exists(path):
        return False
    target = _slash(os.path.abspath(path))
    parent = target.rsplit("/", 1)[0] if "/" in target else "."
    return target in [_slash(f) for f in listdir(parent)]

def file_exists(path, cwd = ""):
    """test -f path (run from cwd when given)."""
    if IS_NATIVE_WINDOWS:
        full = path
        if cwd and not (path.startswith("/") or (len(path) > 1 and path[1] == ":")):
            full = cwd + "/" + path
        return _is_file(full)
    if cwd:
        cmd = ["sh", "-c", 'cd "$1" && test -f "$2" && echo yes || echo no', "sh", cwd, path]
    else:
        cmd = ["sh", "-c", 'test -f "$1" && echo yes || echo no', "sh", path]
    return str(local(cmd, quiet = True, echo_off = True)).strip() == "yes"

def dir_exists(path):
    """test -d path."""
    if IS_NATIVE_WINDOWS:
        return os.path.exists(path)
    return str(local(["sh", "-c", 'test -d "$1" && echo yes || echo no', "sh", path], quiet = True, echo_off = True)).strip() == "yes"

def exists(path):
    """True when path exists (file or directory)."""
    return os.path.exists(path)

def _relative_files(root, display_root = None):
    """(relative path, joined path) for every file under root, sorted; [] when root is missing.

    display_root is what the joined paths start with (default root), so a root resolved against the
    project directory can still report project-relative paths like `find` run after `cd` does.
    """
    if not os.path.exists(root):
        return []
    base = _slash(os.path.abspath(root)).rstrip("/") + "/"
    shown = _slash(display_root if display_root != None else root).rstrip("/")
    out = []
    for f in listdir(root, recursive=True):
        f = _slash(f)
        if f.startswith(base):
            rel = f[len(base):]
            out.append((rel, shown + "/" + rel))
    return sorted(out)

def find_files(root, name, max_depth = 0, display_root = None):
    """find <root> -type f -name <name> | sort. name may use * and ?. max_depth 0 means unlimited."""
    found = []
    for rel, joined in _relative_files(root, display_root):
        parts = rel.split("/")
        if max_depth and len(parts) > max_depth:
            continue
        if _glob_match(name, parts[-1]):
            found.append(joined)
    return found

def find_files_in_glob_dirs(project_root, patterns, name, max_depth = 3):
    """Expand space-separated directory globs (identity-*, services/*/api) under project_root, then find files named name."""
    found = []
    seen = {}
    files = _relative_files(project_root)
    for pattern in patterns.split():
        segments = [s for s in _slash(pattern).split("/") if s and s != "."]
        for rel, _ in files:
            parts = rel.split("/")
            if len(parts) <= len(segments):
                continue
            if not all([_glob_match(segments[i], parts[i]) for i in range(len(segments))]):
                continue
            below = parts[len(segments):]
            if len(below) > max_depth or not _glob_match(name, below[-1]):
                continue
            if rel not in seen:
                seen[rel] = True
                found.append(rel)
    return sorted(found)

def list_subdirs(root, prefix):
    """Names of directories directly under root that start with prefix (ls -d root/prefix*/)."""
    names = {}
    for rel, _ in _relative_files(root):
        parts = rel.split("/")
        if len(parts) > 1 and parts[0].startswith(prefix):
            names[parts[0]] = True
    return sorted(names.keys())

def is_absolute(path):
    return path.startswith("/") or path.startswith("\\") or (len(path) > 1 and path[1] == ":")

def relative_path(path, start):
    return os.path.relpath(path, start)

_PS = ["powershell", "-NoProfile", "-NonInteractive", "-Command"]

def ensure_dir(path):
    """mkdir -p"""
    local(
        ["mkdir", "-p", path],
        command_bat = _PS + ["New-Item -ItemType Directory -Force -Path $env:FLISK_PATH | Out-Null"],
        env = {"FLISK_PATH": path},
        quiet = True,
    )

def read_text(path):
    """Contents of path, or "" when it cannot be read (no Tilt file watch is registered)."""
    return str(local(
        ["sh", "-c", 'cat "$1" 2>/dev/null || echo ""', "sh", path],
        command_bat = _PS + ["if (Test-Path -LiteralPath $env:FLISK_PATH -PathType Leaf) { [IO.File]::ReadAllText($env:FLISK_PATH) }"],
        env = {"FLISK_PATH": path},
        quiet = True,
        echo_off = True,
    ))

def write_text(path, content):
    """Create parent directories and write content plus a newline (what echo does), as UTF-8 without BOM."""
    local(
        ["sh", "-c", 'mkdir -p "$(dirname "$1")" && echo "$2" > "$1"', "sh", path, content],
        command_bat = _PS + ["New-Item -ItemType Directory -Force -Path (Split-Path -Parent $env:FLISK_PATH) | Out-Null; [IO.File]::WriteAllText($env:FLISK_PATH, $env:FLISK_CONTENT + \"`n\", (New-Object Text.UTF8Encoding($false)))"],
        env = {"FLISK_PATH": path, "FLISK_CONTENT": content},
        quiet = True,
        echo_off = True,
    )

def write_text_exact(dir_path, file_path, content):
    """mkdir -p dir_path, then write content exactly (printf '%s'), as UTF-8 without BOM."""
    local(
        ["sh", "-c", 'mkdir -p "$1" && printf "%s" "$2" > "$3"', "sh", dir_path, content, file_path],
        command_bat = _PS + ["New-Item -ItemType Directory -Force -Path $env:FLISK_DIR | Out-Null; [IO.File]::WriteAllText($env:FLISK_PATH, $env:FLISK_CONTENT, (New-Object Text.UTF8Encoding($false)))"],
        env = {"FLISK_DIR": dir_path, "FLISK_PATH": file_path, "FLISK_CONTENT": content},
        quiet = True,
        echo_off = True,
    )

def iso_timestamp():
    """Local time as YYYY-MM-DDTHH:MM:SS (date +%Y-%m-%dT%H:%M:%S)."""
    return str(local(
        "date +%Y-%m-%dT%H:%M:%S",
        command_bat = _PS + ["Get-Date -Format s"],
        quiet = True,
    )).strip()

def now_seconds():
    return int(str(local(
        "date +%s",
        command_bat = _PS + ["[int][double]::Parse((Get-Date -UFormat %s))"],
        quiet = True,
        echo_off = True,
    )).strip())

def sleep_seconds(seconds):
    local(
        ["sleep", str(seconds)],
        command_bat = _PS + ["Start-Sleep -Seconds " + str(seconds)],
        quiet = True,
        echo_off = True,
    )
