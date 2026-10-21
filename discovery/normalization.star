# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load(
    "./manifest/normalize.star",
    _load_and_normalize = "load_and_normalize",
    _load_all_manifests = "load_all_manifests",
)

def normalize(manifest_path, warn_only = True):
    return _load_and_normalize(manifest_path, warn_only = warn_only)

def normalize_all(root_path, warn_only = True):
    return _load_all_manifests(root_path, warn_only = warn_only)
