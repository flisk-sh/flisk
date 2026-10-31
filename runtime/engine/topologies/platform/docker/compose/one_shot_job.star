# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🏁 ONE-SHOT JOBS (#2871)
# =============================================================================
# A one-shot job runs once and exits: a `migrator`, or a bring-your-own resource with "restart": "no" (docs/byo.md, one-shot
# jobs). Its container is never restarted, and a service that depends on it must start only after it exited 0, which the
# orchestrator enforces with a `<job>-done` resource (apply_compose_resource_registration.star).
# =============================================================================


def is_one_shot_job(manifest):
    """True for a resource that runs once and exits: a migrator, or a bring-your-own resource with "restart": "no"."""
    if type(manifest) != 'dict':
        return False
    if manifest.get('appType') == 'migrator':
        return True
    return manifest.get('appType') == 'bring-your-own' and manifest.get('restart') == 'no'
