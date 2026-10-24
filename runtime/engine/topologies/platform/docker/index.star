# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load(
    "./dockerfile/dockerfile.star",
    "generate_frontend_dockerfile",
    "generate_app_dockerfile",
    "generate_migrator_dockerfile",
)
load(
    "./dockerfile/language_dockerfile.star",
    "generate_language_dockerfile",
    "is_provider_owned_language",
    "go_live_reload_enabled",
    "LANGUAGE_REQUIRED_FILES",
)
load("./config/dockerignore.star", "generate_dockerignore")
load(
    "./compose/compose.star",
    "generate_frontend_compose",
    "generate_backend_compose_entry",
    "generate_app_compose_from_entries",
    "generate_migrator_compose",
)
load("./build/golden_image.star", "GoldenImage")

Docker = struct(
    frontend = generate_frontend_dockerfile,
    backend = generate_app_dockerfile,
    migrator = generate_migrator_dockerfile,
    backend_language = generate_language_dockerfile,
    is_provider_owned_language = is_provider_owned_language,
    go_live_reload = go_live_reload_enabled,
    language_required_files = LANGUAGE_REQUIRED_FILES,
    generate_dockerignore = generate_dockerignore,
    frontend_compose = generate_frontend_compose,
    backend_compose = generate_backend_compose_entry,
    app_compose = generate_app_compose_from_entries,
    migrator_compose = generate_migrator_compose,
    golden_image = GoldenImage,
)
