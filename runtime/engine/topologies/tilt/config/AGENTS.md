# AGENTS.md - Global Configuration

## Purpose

Global Tilt configuration, feature flags, environment profiles, and defaults.

## Key Files

### Core Config
- **`global.star`** - Global configuration loading
- **`profiles.star`** - Environment profiles (dev, staging, prod)
- **`features.star`** - Feature flags

### Defaults
- **`defaults.star`** - Default values for all settings
- **`overrides.star`** - Local overrides (gitignored)

## Key Concepts

### Configuration Hierarchy
```
1. defaults.star        (base values)
2. profiles.star        (environment-specific)
3. global.star          (project-wide)
4. overrides.star       (local user settings)
5. Environment vars     (runtime)
```

## Common Tasks

### Get global config
```starlark
load("../discovery/config.star", "get_global_config")
config = get_global_config()
```

### Check feature flag
```starlark
load("./features.star", "is_feature_enabled")
if is_feature_enabled("nats_streaming"):
    # Enable NATS
```

### Get profile
```starlark
load("./profiles.star", "get_profile")
profile = get_profile()  # "pre-alpha", "alpha", "beta", "production"
```

## Integration

- Loaded by main `Tiltfile`
- Used by `discovery/config.star`
- Referenced by `spec.master`

## Important Files

- `spec.master` (project root) - Service-specific defaults
- `.env` - Local environment variables
- `tilt_options.json` - Tilt-specific options

## Configuration Values

Common config includes:
- `MOCK_TIKKIE` - Use mock payment API
- `FOCUS_*` - Which service groups to load
- `DB_*` - Database settings
- `VERDACCIO_*` - NPM registry settings
