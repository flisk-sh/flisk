# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🛠️ TILT SDK - DEBUG UTILITIES
# =============================================================================

DEBUG_MODE = (os.environ.get('TDK_DEBUG') or os.environ.get('TILT_DEBUG', 'false')).lower() in ['true', '1', 'yes']


def debug_log(message, data=None):
    """
    Standardized debug logger. Only prints if DEBUG_MODE is True.
    """
    if DEBUG_MODE:
        prefix = "DEBUG 🛠️  |"
        if data:
            print("{} {}: {}".format(prefix, message, data))
        else:
            print("{} {}".format(prefix, message))


def inspect(obj, label="Object"):
    """
    Inspect a Starlark object's structure and available methods/attributes.
    """
    debug_log("Inspecting {} - Type: {}".format(label, type(obj)))

    if type(obj) == 'dict':
        debug_log("  Keys", list(obj.keys()))
        for key in obj.keys():
            debug_log("    [{}]".format(key), obj[key])
    elif type(obj) == 'list':
        debug_log("  Length", len(obj))
        for i, item in enumerate(obj):
            debug_log("    [{}]".format(i), item)
    else:
        debug_log("  Available methods/attributes:")
        for item in dir(obj):
            print("    - {}".format(item))


def breadcrumb(file_name, status="Loading"):
    """
    Print a breadcrumb log to track file loading/execution.
    """
    emoji_map = {
        "Loading": "📍",
        "Completed": "✅",
        "Failed": "❌",
        "Skipped": "⏭️",
    }
    emoji = emoji_map.get(status, "🔹")
    print("{} {}: {}".format(emoji, status, file_name))


def fail_with_context(message, context=None):
    """
    Fail with a detailed error message and optional context data.
    """
    error_msg = "\n" + ("=" * 79) + "\n"
    error_msg += "❌ ERROR: {}\n".format(message)

    if context:
        error_msg += "\nContext:\n"
        for key in context.keys():
            error_msg += "  - {}: {}\n".format(key, context[key])

    error_msg += ("=" * 79) + "\n"
    fail(error_msg)

DEBUG = {}
