# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
"""
Pytest configuration and shared fixtures for tilt-engine tests.
"""

import json
import os
import pytest
import tempfile
import shutil
from pathlib import Path
from typing import Generator


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Create a temporary directory for testing."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def mock_resources_dir(temp_dir: Path) -> Path:
    """Create a mock resources directory structure with sample service.json files."""
    resources_dir = temp_dir / "services" / "product"
    resources_dir.mkdir(parents=True)
    
    # Create test resources
    for stack in ["identity", "order"]:
        stack_dir = resources_dir / stack
        for resource in [f"{stack}-backend", f"{stack}-frontend"]:
            resource_dir = stack_dir / resource
            resource_dir.mkdir(parents=True)
            resource_file = resource_dir / "service.json"
            resource_file.write_text(json.dumps({
                "name": resource,
                "type": "backend" if "backend" in resource else "frontend",
                "stack": stack,
                "port": 4001 if "backend" in resource else 3001,
                "path": str(resource_dir.relative_to(temp_dir))
            }, indent=2))
    
    return resources_dir


@pytest.fixture
def mock_resource_json() -> dict:
    """Return a sample valid service.json structure."""
    return {
        "name": "test-resource",
        "appType": "backend",
        "stack": "test",
        "port": 4000,
        "path": "services/product/test/test-resource",
        "features": ["prisma", "nats"],
        "replicas": 1
    }


@pytest.fixture
def mock_invalid_resource_json() -> dict:
    """Return an invalid service.json (missing required fields)."""
    return {
        "appType": "backend",
        # Missing: name, stack, port, path
    }


@pytest.fixture
def sample_snapshot() -> dict:
    """Return a sample snapshot structure."""
    return {
        "timestamp": "2024-01-15T10:30:00Z",
        "resources": [
            "services/product/identity/identity-backend/service.json",
            "services/product/identity/identity-frontend/service.json",
        ],
        "count": 2,
        "hash": "abc123def456"
    }


@pytest.fixture
def mock_health_response() -> dict:
    """Return a sample health check response."""
    return {
        "status": "healthy",
        "resource": "test-resource",
        "version": "1.0.0",
        "timestamp": "2024-01-15T10:30:00Z",
        "uptime": 3600,
        "dependencies": {
            "database": "healthy",
            "cache": "healthy"
        }
    }


@pytest.fixture
def mock_tilt_ui_status() -> dict:
    """Return mock Tilt UI status for testing status colors."""
    return {
        "ready": {"indicator": "green", "status": "Ready"},
        "starting": {"indicator": "yellow", "status": "Starting"},
        "error": {"indicator": "red", "status": "Error"}
    }


@pytest.fixture
def protected_volumes() -> list:
    """Return list of protected volume patterns."""
    return [
        "verdaccio-storage",
        "verdaccio-conf",
        "verdaccio-plugins",
        "infisical-db-data",
        "infisical-redis-data"
    ]


@pytest.fixture
def dangerous_commands() -> list:
    """Return list of commands that should be blocked by code executor."""
    return [
        "rm -rf /",
        "sudo rm -rf /",
        "sudo su",
        "passwd",
        "mkfs",
        "dd if=/dev/zero",
    ]


@pytest.fixture
def safe_commands() -> list:
    """Return list of commands that should be allowed by code executor."""
    return [
        "bun test",
        "bun run dev",
        "ls -la",
        "cat package.json",
        "git status",
        "echo hello",
    ]


@pytest.fixture
def resource_registry_cache() -> dict:
    """Return an empty resource registry cache structure."""
    return {
        "initialized": False,
        "app_resources": [],
        "resource_dependencies": {},
        "resource_aliases": {},
        "resource_path_map": {}
    }


@pytest.fixture
def mock_ide_server_port() -> int:
    """Return mock port for IDE component testing."""
    return 9999  # Non-standard port for testing


@pytest.fixture
def focus_mode_config() -> dict:
    """Return focus mode configuration for testing."""
    return {
        "enabled": True,
        "stacks": ["identity", "order"],
        "excluded_paths": []
    }


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "snapshot: Tests for resource snapshot functionality")
    config.addinivalue_line("markers", "docker: Tests that start a real container (need Docker and network)")
    config.addinivalue_line("markers", "daemon: Tests for discovery daemon")
    config.addinivalue_line("markers", "health: Tests for health check endpoints")
    config.addinivalue_line("markers", "ide: Tests for IDE components")
    config.addinivalue_line("markers", "safety: Tests for safety guards")
    config.addinivalue_line("markers", "cache: Tests for registry cache")
    config.addinivalue_line("markers", "integration: Integration tests")
