# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🎛️ ORCHESTRATOR APPLY - RUNTIME FLAGS
# =============================================================================

def _resolve_bool_env(env_name, default_value):
    value = os.environ.get(env_name, '').lower()
    if value in ['1', 'true', 'yes', 'on']:
        return True
    if value in ['0', 'false', 'no', 'off']:
        return False
    return default_value


def resolve_runtime_flags():
    trigger_mode = os.environ.get('TILT_TRIGGER_MODE', 'auto').lower()

    # Match trigger mode semantics by default:
    # - auto mode: boot app resources automatically
    # - manual mode: require explicit triggers for app resources
    auto_init_apps = _resolve_bool_env('TILT_AUTO_INIT_APPS', trigger_mode == 'auto')
    auto_init_migrators = _resolve_bool_env('TILT_AUTO_INIT_MIGRATORS', False)

    # Config generators are lightweight and safe to run on startup by default.
    auto_init_config_gen = _resolve_bool_env('TILT_AUTO_INIT_CONFIG_GEN', True)

    # In manual mode, avoid hard gating app backends on migrator builds.
    enforce_migrator_deps = _resolve_bool_env('TILT_ENFORCE_MIGRATOR_DEPS', trigger_mode == 'auto')

    # In manual mode, default to single replica for faster local feedback loops.
    disable_app_replicas = _resolve_bool_env('TILT_DISABLE_APP_REPLICAS', trigger_mode == 'manual')

    return {
        'trigger_mode': trigger_mode,
        'auto_init_apps': auto_init_apps,
        'auto_init_migrators': auto_init_migrators,
        'auto_init_config_gen': auto_init_config_gen,
        'enforce_migrator_deps': enforce_migrator_deps,
        'disable_app_replicas': disable_app_replicas,
    }


RuntimeFlags = struct(
    resolve = resolve_runtime_flags,
)
