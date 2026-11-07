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

def _clean(path):
    """Slash path with empty and `.` segments dropped and `..` collapsed, the way Tilt's listdir returns paths.

    os.path.abspath keeps `//` and `..` (the generated Tiltfile's root is config.main_dir + "/../.."), but listdir returns
    cleaned paths, so comparing the two without this matched nothing: "Loaded 0 services" on the hosted Windows run.
    """
    p = _slash(path)
    drive = ""
    if len(p) > 1 and p[1] == ":":
        drive = p[:2]
        p = p[2:]
    absolute = p.startswith("/")
    parts = []
    for segment in p.split("/"):
        if segment == "" or segment == ".":
            continue
        if segment == "..":
            if parts and parts[-1] != "..":
                parts.pop()
                continue
            if absolute:
                continue
        parts.append(segment)
    return drive + ("/" if absolute else "") + "/".join(parts)

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
    target = _clean(os.path.abspath(path))
    parent = target.rsplit("/", 1)[0] if "/" in target else "."
    return target in [_clean(f) for f in listdir(parent)]

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
        # os.path.exists is also true for files; listdir reports files only, so ask _is_file.
        return os.path.exists(path) and not _is_file(path)
    return str(local(["sh", "-c", 'test -d "$1" && echo yes || echo no', "sh", path], quiet = True, echo_off = True)).strip() == "yes"

def exists(path):
    """True when path exists (file or directory)."""
    return os.path.exists(path)

def files_scan_command():
    """The command_bat list that prints, one per line, the files under $env:FLISK_SCAN_ROOT as paths relative to it.

    $env:FLISK_SCAN_NAME filters by name (Get-ChildItem -Filter, * and ? work) and $env:FLISK_SCAN_DEPTH limits how many levels
    below the root are searched (0 means direct children only, like find -maxdepth 1). Unset means no limit.
    """
    return _PS + [
        "try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }; "
        # A missing root is an empty scan (like find on POSIX after the os.path.exists guard); anything else that goes wrong must fail.
        + "$r = (Resolve-Path -LiteralPath $env:FLISK_SCAN_ROOT -ErrorAction SilentlyContinue).Path; if (-not $r) { exit 0 }; "
        # TrimEnd turns C:\ into C:, which means the current directory on drive C, so put the backslash back for a drive root.
        + "$r = $r.TrimEnd([char]92, [char]47); if ($r.Length -eq 2 -and $r[1] -eq ':') { $r = $r + [char]92 }; "
        # Characters to cut from each FullName: the root plus its separator, which a drive root already ends with.
        + "$n = $r.Length; if ($r[$r.Length - 1] -ne [char]92) { $n = $n + 1 }; "
        + "$p = @{ LiteralPath = $r; Recurse = $true; File = $true; Force = $true; ErrorAction = 'Stop' }; "
        + "if ($env:FLISK_SCAN_NAME -and $env:FLISK_SCAN_NAME -ne '*') { $p.Filter = $env:FLISK_SCAN_NAME }; "
        + "if ($env:FLISK_SCAN_DEPTH) { $p.Depth = [int]$env:FLISK_SCAN_DEPTH }; "
        # An unreadable directory fails the scan (exit 1, so local() fails the Tiltfile) instead of silently dropping its services.
        + "try { Get-ChildItem @p | ForEach-Object { $_.FullName.Substring($n) } } catch { [Console]::Error.WriteLine('flisk discovery scan failed: ' + $_.Exception.Message); exit 1 }; exit 0",
    ]

def _relative_files(root, display_root = None, name = "*", max_depth = 0):
    """(relative path, joined path) for every file under root, sorted; [] when root is missing.

    display_root is what the joined paths start with (default root), so a root resolved against the
    project directory can still report project-relative paths like `find` run after `cd` does.

    On real Windows the files come from one PowerShell call, like `find` on POSIX. Tilt's listdir would also work, but it registers a
    file watch on everything it lists: every generated file under the project then re-ran the Tiltfile (a load took over a minute
    because it walked node_modules, and each load rewrote files that triggered the next one, run 42238846641). name and max_depth
    narrow the search there, and a scan that cannot read part of the tree fails instead of returning a partial list; max_depth counts levels like find -maxdepth (0 = unlimited).
    """
    if not os.path.exists(root):
        return []
    shown = _slash(display_root if display_root != None else root).rstrip("/")
    if os.name == "nt":
        env = {"FLISK_SCAN_ROOT": root, "FLISK_SCAN_NAME": name}
        if max_depth:
            env["FLISK_SCAN_DEPTH"] = str(max_depth - 1)
        listing = str(local(["true"], command_bat = files_scan_command(), env = env, quiet = True, echo_off = True))
        out = []
        for line in listing.split("\n"):
            rel = _slash(line.strip())
            if rel:
                out.append((rel, shown + "/" + rel))
        return sorted(out)
    base = _clean(os.path.abspath(root)).rstrip("/") + "/"
    out = []
    for f in listdir(root, recursive=True):
        f = _clean(f)
        if f.startswith(base):
            rel = f[len(base):]
            out.append((rel, shown + "/" + rel))
    return sorted(out)

def find_files(root, name, max_depth = 0, display_root = None):
    """find <root> -type f -name <name> | sort. name may use * and ?. max_depth 0 means unlimited."""
    found = []
    for rel, joined in _relative_files(root, display_root, name, max_depth):
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
    deepest = max([len([x for x in _slash(p).split("/") if x and x != "."]) for p in patterns.split()] + [0])
    files = _relative_files(project_root, None, name, deepest + max_depth)
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
    """Names of directories directly under root that start with prefix (ls -d root/prefix*/).

    Tilt's listdir returns files only, so on real Windows this asks PowerShell, which also finds empty
    directories like `ls -d` does. Under FLISK_DISCOVERY_PORTABLE=1 on POSIX (tests only) there is no
    PowerShell, so directories are inferred from the files below them and empty ones are missed.
    """
    if os.name == "nt":
        out = str(local(
            ["true"],
            command_bat = _PS + ["Get-ChildItem -LiteralPath $env:FLISK_ROOT -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name.StartsWith($env:FLISK_PREFIX) } | Sort-Object Name | ForEach-Object { $_.Name }"],
            env = {"FLISK_ROOT": root, "FLISK_PREFIX": prefix},
            quiet = True,
            echo_off = True,
        ))
        return [n.strip() for n in out.split("\n") if n.strip()]
    names = {}
    for rel, _ in _relative_files(root):
        parts = rel.split("/")
        if len(parts) > 1 and parts[0].startswith(prefix):
            names[parts[0]] = True
    return sorted(names.keys())

def is_absolute(path):
    """Absolute on Windows: a leading `/` or `\\` (rooted or UNC), or a drive plus a separator (`C:\\x`, `C:/x`).

    `C:x` is drive-relative (relative to the current directory on drive C), so it is not absolute.
    """
    if path.startswith("/") or path.startswith("\\"):
        return True
    return len(path) > 2 and path[1] == ":" and (path[2] == "\\" or path[2] == "/")

def is_abs_path(path):
    """True for an absolute path: a leading `/` everywhere, and on native Windows also `\\...` and `C:` drive paths.

    Off Windows this is exactly path.startswith("/"), so Linux, macOS and WSL2 behave as before. Code that prefixed
    FLISK_PROJECT_ROOT onto anything not starting with `/` doubled the prefix on a Windows path (run 42183705419).
    """
    if path.startswith("/"):
        return True
    return IS_NATIVE_WINDOWS and is_absolute(path)

def _ps_quote(text):
    """A PowerShell single-quoted string literal (a quote inside is doubled)."""
    return "'" + text.replace("'", "''") + "'"

def python_script_command(script, args):
    """The command_bat list that runs `python <script> <args...>` through PowerShell, in UTF-8 mode.

    Picks the first python3, python or py that answers --version (a Microsoft Store alias resolves but runs nothing) and
    keeps Python's stdout in UTF-8 instead of the console code page. Every path goes in as a single-quoted string.
    """
    probe = (
        "$env:PYTHONUTF8 = '1'; try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }; $py = $null; "
        + "foreach ($n in 'python3', 'python', 'py') { foreach ($c in @(Get-Command $n -All -ErrorAction SilentlyContinue)) { "
        + "& $c.Source --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $c; break } }; if ($py) { break } }; "
        + "if (-not $py) { Write-Error 'python3, python or py is needed on PATH'; exit 1 }; "
    )
    call = "& $py.Source " + _ps_quote(script) + "".join([" " + _ps_quote(a) for a in args]) + "; exit $LASTEXITCODE"
    return _PS + [probe + call]

def relative_path(path, start):
    return os.path.relpath(path, start)

_PS = ["powershell", "-NoProfile", "-NonInteractive", "-Command"]

# Public alias for the PowerShell prefix, for command_bat / cmd_bat / serve_cmd_bat at call sites outside this file.
POWERSHELL = _PS

def file_mtime(path):
    """Modification time of path as Unix seconds, 0 when it does not exist (stat -f %m || stat -c %Y || 0)."""
    out = str(local(
        ["sh", "-c", 'stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0', "sh", path],
        command_bat = _PS + ["if (Test-Path -LiteralPath $env:FLISK_PATH) { ([DateTimeOffset](Get-Item -LiteralPath $env:FLISK_PATH).LastWriteTimeUtc).ToUnixTimeSeconds() } else { 0 }"],
        env = {"FLISK_PATH": path},
        quiet = True,
        echo_off = True,
    )).strip()
    return int(out) if out.isdigit() else 0

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

# Linux refuses any single argument over 128 KiB (MAX_ARG_STRLEN), and a project of hundreds of resources generates a compose
# file bigger than that. Content goes to the shell in pieces of at most this many bytes (Starlark's len() counts UTF-8 bytes),
# cut at line ends. A line longer than that is cut between characters, never inside one.
WRITE_PIECE_BYTES = 32768

def _split_long_line(text):
    parts = []
    chars = []
    size = 0
    for c in text.codepoints():
        if size + len(c) > WRITE_PIECE_BYTES:
            parts.append("".join(chars))
            chars = []
            size = 0
        chars.append(c)
        size += len(c)
    parts.append("".join(chars))
    return parts

def _write_pieces(content):
    lines = content.split("\n")
    pieces = []
    current = ""
    for i, line in enumerate(lines):
        text = line + ("\n" if i < len(lines) - 1 else "")
        if len(text) > WRITE_PIECE_BYTES:
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(_split_long_line(text))
            continue
        if current and len(current) + len(text) > WRITE_PIECE_BYTES:
            pieces.append(current)
            current = ""
        current += text
    if current or not pieces:
        pieces.append(current)
    return pieces

def write_text_exact(dir_path, file_path, content):
    """mkdir -p dir_path, then write content exactly (printf '%s'), as UTF-8 without BOM.

    Every write builds the content in a temporary file beside file_path (created exclusively by mktemp, or named by a GUID
    on Windows) and renames it over file_path once the content is complete, so a reader or a second Tilt writing the same
    file never sees half of it, and a failed write leaves file_path as it was. Content that fits one piece does all of that
    in one command; larger content creates the file with the first piece, appends the rest, then renames.
    """
    pieces = _write_pieces(content)
    single = len(pieces) == 1
    # mktemp creates the file 0600; give it the mode a plain `>` would (0666 minus the umask). A failed write removes it.
    sh_create = (
        'mkdir -p "$1" && t=$(mktemp "$3.flisk-tmp.XXXXXX") && ' +
        '{ chmod "$(printf %o $((0666 & ~$(umask))))" "$t" && printf "%s" "$2" > "$t" && ' +
        ('mv -f "$t" "$3"' if single else 'printf "%s" "$t"') +
        ' || { rm -f "$t"; exit 1; }; }'
    )
    bat_create = (
        "New-Item -ItemType Directory -Force -Path $env:FLISK_TARGET_DIR | Out-Null; " +
        "$t = $env:FLISK_PATH + '.flisk-tmp.' + [guid]::NewGuid().ToString('N'); " +
        "[IO.File]::WriteAllText($t, $env:FLISK_CONTENT, (New-Object Text.UTF8Encoding($false))); " +
        ("Move-Item -Force -LiteralPath $t -Destination $env:FLISK_PATH" if single else "Write-Output $t")
    )
    created = str(local(
        ["sh", "-c", sh_create, "sh", dir_path, pieces[0], file_path],
        command_bat = _PS + [bat_create],
        env = {"FLISK_TARGET_DIR": dir_path, "FLISK_PATH": file_path, "FLISK_CONTENT": pieces[0]},
        quiet = True,
        echo_off = True,
    ))
    if single:
        return
    tmp_path = created.strip()
    for piece in pieces[1:]:
        local(
            ["sh", "-c", 'printf "%s" "$2" >> "$1"', "sh", tmp_path, piece],
            command_bat = _PS + ["[IO.File]::AppendAllText($env:FLISK_PATH, $env:FLISK_CONTENT, (New-Object Text.UTF8Encoding($false)))"],
            env = {"FLISK_PATH": tmp_path, "FLISK_CONTENT": piece},
            quiet = True,
            echo_off = True,
        )
    local(
        ["mv", "-f", tmp_path, file_path],
        command_bat = _PS + ["Move-Item -Force -LiteralPath $env:FLISK_TMP -Destination $env:FLISK_PATH"],
        env = {"FLISK_TMP": tmp_path, "FLISK_PATH": file_path},
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
