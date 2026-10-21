# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for resource snapshot scanning functionality.
Tests the filesystem scanning and service.json discovery.
"""

import json
import os
import pytest
from pathlib import Path


@pytest.mark.snapshot
class TestSnapshotScanning:
    """Tests for filesystem scanning functionality."""
    
    def test_scanning_finds_valid_resource_files(self, temp_dir, monkeypatch):
        """
        Scenario: Scanning finds valid resource files
        WHEN the scanner runs against a directory containing 3 valid service.json files
        THEN it SHALL return a list of 3 resources with correct paths and parsed metadata
        """
        # Create test directory structure with 3 resources
        resources = [
            ("services/product/identity/identity-backend", "identity-backend"),
            ("services/product/identity/identity-frontend", "identity-frontend"),
            ("services/product/order/order-backend", "order-backend"),
        ]
        
        for resource_path, resource_name in resources:
            resource_dir = temp_dir / resource_path
            resource_dir.mkdir(parents=True)
            resource_file = resource_dir / "service.json"
            resource_file.write_text(json.dumps({
                "name": resource_name,
                "type": "backend" if "backend" in resource_name else "frontend",
                "stack": resource_path.split("/")[2],
                "port": 4001 if "backend" in resource_name else 3001
            }))
        
        # Import and test
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import get_current_resources
        
        # Change to temp directory for scanning
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            found_resources = get_current_resources("services/product")
            
            assert len(found_resources) == 3, f"Expected 3 resources, found {len(found_resources)}"
            assert all("service.json" in r for r in found_resources), "All resources should be service.json files"
        finally:
            os.chdir(original_dir)
    
    def test_scanning_ignores_non_resource_files(self, temp_dir, monkeypatch):
        """
        Scenario: Scanning ignores non-resource files
        WHEN the scanner runs against a directory containing service.json and package.json and README.md
        THEN it SHALL only return the resource defined in service.json
        """
        # Create directory with mixed files
        resource_dir = temp_dir / "services" / "product" / "test"
        resource_dir.mkdir(parents=True)
        
        # Create service.json
        (resource_dir / "service.json").write_text(json.dumps({"name": "test-resource"}))
        # Create non-resource files
        (resource_dir / "package.json").write_text('{"name": "test"}')
        (resource_dir / "README.md").write_text("# Test Resource")
        (resource_dir / "config.ts").write_text("export const config = {};")
        
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import get_current_resources
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            found_resources = get_current_resources("services/product")
            
            assert len(found_resources) == 1, f"Expected 1 resource, found {len(found_resources)}"
            assert "service.json" in found_resources[0], "Should only find service.json files"
            assert "package.json" not in found_resources[0], "Should not include package.json"
        finally:
            os.chdir(original_dir)
    
    def test_scanning_handles_nested_directories(self, temp_dir, monkeypatch):
        """
        Scenario: Scanning handles nested directories
        WHEN the scanner runs against a directory with nested resources/ subdirectory containing service.json
        THEN it SHALL find resources at any depth and return correct relative paths
        """
        # Create deeply nested structure
        nested_dirs = [
            "services/product/stack1/backend/service.json",
            "services/product/stack1/frontend/service.json",
            "services/product/stack2/substack/backend/service.json",
        ]
        
        for path in nested_dirs:
            full_path = temp_dir / path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(json.dumps({"name": "test"}))
        
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import get_current_resources
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            found_resources = get_current_resources("services/product")
            
            assert len(found_resources) == 3, f"Expected 3 resources, found {len(found_resources)}"
            # Verify all paths are relative and contain the full path
            assert all("stack1" in r or "stack2" in r for r in found_resources)
            assert all("service.json" in r for r in found_resources)
        finally:
            os.chdir(original_dir)
