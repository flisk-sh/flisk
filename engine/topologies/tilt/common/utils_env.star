# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🌍 TILT SDK - ENVIRONMENT UTILITIES
# =============================================================================


_DOTENV_NAME_FIRST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'
_DOTENV_NAME_REST = _DOTENV_NAME_FIRST + '0123456789'

# The environment variable `flisk up --env-file <path>` sets. The CLI resolves the path and
# exports it, so the engine reads one file for the whole run.
PROJECT_ENV_FILE_VAR = 'TDK_ENV_FILE'


def _is_dotenv_name(name):
    if not name or name[0] not in _DOTENV_NAME_FIRST:
        return False
    for i in range(len(name)):
        if name[i] not in _DOTENV_NAME_REST:
            return False
    return True


def _dotenv_value(raw):
    """One layer of matching quotes is removed, like a dotenv parser would.

    Single quotes are literal. Inside double quotes a backslash escapes a quote, a backslash or a dollar sign, and \\n, \\r and \\t
    become a newline, a carriage return and a tab. An unquoted value is used as is (inline comments are not stripped).
    This reads the project .env; it does not undo the `$$` that the generated env files use for Docker Compose.
    """
    value = raw.strip()
    if len(value) < 2 or value[0] not in ('"', "'") or value[-1] != value[0]:
        return value

    inner = value[1:-1]
    if value[0] == "'":
        return inner

    result = ''
    i = 0
    while i < len(inner):
        char = inner[i]
        if char == '\\' and i + 1 < len(inner):
            following = inner[i + 1]
            if following == 'n':
                result += '\n'
            elif following == 'r':
                result += '\r'
            elif following == 't':
                result += '\t'
            elif following in ('"', '\\', '$'):
                result += following
            else:
                result += char + following
            i += 2
            continue
        result += char
        i += 1
    return result


def project_env_file(project_root=''):
    """The project env file of this run.

    `flisk up --env-file <path>` exports TDK_ENV_FILE, and the run then reads that file instead of the
    project `.env` - for the Tilt environment and for the Compose interpolation alike. Without the
    variable the project `.env` is used, which is what every run did before the option existed.

    The path is used as it is: the CLI resolved it to an absolute path inside the project, so the
    wake gateway (which mounts the project read-only) can read the same file.
    """
    selected = os.environ.get(PROJECT_ENV_FILE_VAR, '')
    if selected:
        return selected
    return (project_root + '/.env') if project_root else '.env'


def load_dotenv(project_root=''):
    """Load the project env file of this run into os.environ.

    The Tiltfile lives in `.tdk/.tdk-out/`, so a bare `.env` lookup misses the
    project-root file. Prefer an explicit project_root, then TDK_PROJECT_ROOT.

    The file is read with `read_file` and parsed here: nothing goes through a shell, so a path containing a quote is fine, and Tilt
    re-evaluates the Tiltfile when the .env changes. Lines may be `NAME=value` or `export NAME=value`; comments, blank lines and
    lines that are not an assignment to a valid name are ignored. A missing file does nothing.
    """
    if not project_root:
        project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    env_path = project_env_file(project_root)
    content = str(read_file(env_path, default=''))
    if not content:
        return

    for line in content.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[len('export '):].strip()
        equals = line.find('=')
        if equals <= 0:
            continue
        name = line[:equals].strip()
        if _is_dotenv_name(name):
            os.environ[name] = _dotenv_value(line[equals + 1:])


def should_enable(resource_name, cfg, defaults):
    """Check if a service should be enabled based on config and defaults."""
    return cfg.get(resource_name, defaults.get(resource_name, False))
