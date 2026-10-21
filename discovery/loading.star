# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load("./manifest/constants.star", "MANIFEST_FILENAME", "MANIFEST_DEFAULTS", "VALID_APP_TYPES", "DEFAULT_SYNCS")
load("./manifest/loading.star", "load_manifest", "load_related_manifest", "get_default_syncs_for_type")
load("./validation.star", _validate = "validate")
load("./manifest/normalize.star", "load_and_normalize", "discover_manifests_in_path", "load_all_manifests", "get_port", "get_database_url", "print_summary", "generate_manifest_template")

Manifest = struct(
    load_manifest = load_manifest,
    load_related = load_related_manifest,
    load_and_normalize = load_and_normalize,
    discover_manifests = discover_manifests_in_path,
    load_all_manifests = load_all_manifests,
    load_all = load_all_manifests,
    validate = _validate,
    get_port = get_port,
    get_database_url = get_database_url,
    get_default_syncs = get_default_syncs_for_type,
    print_summary = print_summary,
    generate_template = generate_manifest_template,
    FILENAME = MANIFEST_FILENAME,
    DEFAULTS = MANIFEST_DEFAULTS,
    VALID_APP_TYPES = VALID_APP_TYPES,
    DEFAULT_SYNCS = DEFAULT_SYNCS,
)
