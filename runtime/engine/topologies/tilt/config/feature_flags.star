# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load("../../../../discovery/registry.star", _DEFAULTS_EXPORT = "DEFAULTS_EXPORT")

def is_enabled(flag_name, cfg, fallback = True):
    if cfg.get(flag_name) != None:
        return cfg.get(flag_name)
    return _DEFAULTS_EXPORT.get(flag_name, fallback)


# Inlined constant
DEFAULTS = {}
