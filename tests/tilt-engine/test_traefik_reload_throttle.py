# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Traefik routes a container only once Docker reports it healthy, and applies a new provider configuration at most once
per `providersThrottleDuration` (default 2 s). As the services of a stack turn healthy one after another, each one waited
up to 2 s for its route: in the shop benchmark the URLs answered on a 2 s beat (13, 15, 17 s) well after the services
were healthy (flisk#4237). Measured on Traefik v3.7.14, a route came 0.9-1.4 s after healthy with the default and
0.1-0.3 s with 100 ms. The generated Traefik sets 100 ms.

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

import pytest

from test_compose_project_scoping import TILT_REQUIRED, run_project

pytestmark = [pytest.mark.generator]

BODY = """
load('@DOCKER/compose/traefik_standalone.star', 'generate_standalone_traefik_compose')
r = {'traefik': generate_standalone_traefik_compose()}
"""


@TILT_REQUIRED
def test_traefik_applies_new_routes_without_the_2s_default_throttle(tmp_path):
    traefik = run_project(tmp_path, "shop", BODY)["traefik"]
    assert '"--providers.providersThrottleDuration=100ms"' in traefik, traefik
