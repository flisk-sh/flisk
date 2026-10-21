# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_ROOT = ROOT.parent / "tdk-restaurant-example"


def test_frontend_service_manifests_define_explicit_base_paths():
    expected = {
        "reservation-app": "/reservation-app",
        "floor-app": "/floor-app",
    }

    for app_name, expected_base_path in expected.items():
        service_path = (
            EXAMPLE_ROOT
            / "services"
            / ("guest" if app_name == "reservation-app" else "operations")
            / app_name
            / "service.json"
        )
        payload = json.loads(service_path.read_text())

        assert payload["basePath"] == expected_base_path, (
            f"{app_name} should generate the app route as {expected_base_path} instead of the stack default"
        )
