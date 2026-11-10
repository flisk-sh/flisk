# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
A service's image is built as soon as its inputs exist, not after the services it depends on are healthy.

Tilt holds a dc_resource's docker_build until every resource_dep is ready, so a chain of `dependsOn` built one image at a
time (a 10-part shop spent 153 s building the last API alone). `image_prebuild_deps` keeps only what the build needs and
`needs_image_prebuild` says when a separate `<name>-image` build step pays off.
"""

from __future__ import annotations

import pytest

from test_dependson_platform_postgres import ORCHESTRATOR, TILT_REQUIRED, run_starlark

pytestmark = [pytest.mark.generator]


@TILT_REQUIRED
def test_prebuild_waits_only_for_what_the_image_build_needs(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'image_prebuild_deps', 'needs_image_prebuild')\n"
        "deps = ['postgres', 'provision-db-shop', 'golden-layers-build', 'orders-api-config-gen', 'catalog-api-migrator-done', 'catalog-api-healthy']\n"
        "r = {"
        "'deps': image_prebuild_deps(deps), "
        "'verdaccio': image_prebuild_deps(['verdaccio', 'x-config-gen']), "
        "'gated': needs_image_prebuild(deps), "
        "'ungated': needs_image_prebuild(['golden-layers-build', 'x-config-gen']), "
        "'none': needs_image_prebuild([]), "
        "}\n",
    )
    assert result["deps"] == ["golden-layers-build", "orders-api-config-gen"]
    assert result["verdaccio"] == ["verdaccio", "x-config-gen"]
    assert result["gated"] is True
    # Nothing to overlap: the image already builds as early as it can.
    assert result["ungated"] is False
    assert result["none"] is False
