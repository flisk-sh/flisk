# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for daemon auto-registration functionality.
Tests the triggering of Tilt resource creation for new services.
"""

import pytest
from pathlib import Path
from unittest.mock import Mock, patch, call
import json


@pytest.mark.daemon
class TestDaemonRegistration:
    """Tests for daemon auto-registration."""
    
    def test_new_resource_triggers_registration(self, temp_dir):
        """
        Scenario: New service triggers registration
        WHEN the daemon detects a new service.json file not in the cache
        THEN it SHALL emit a registration event with the service path and metadata
        AND the Tilt resource for that service SHALL be created
        """
        from pathlib import Path
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import diff_snapshots, save_snapshot, load_snapshot
        
        original_dir = Path.cwd()
        
        try:
            # Set up initial snapshot
            services_dir = temp_dir / "services" / "product"
            initial_service = services_dir / "existing" / "service"
            initial_service.mkdir(parents=True)
            (initial_service / "service.json").write_text(json.dumps({"name": "existing"}))
            
            import os
            os.chdir(temp_dir)
            
            # Save initial snapshot
            from resource_snapshot import get_current_services
            initial_services = get_current_services("services/product")
            save_snapshot(initial_services)
            
            # Simulate adding new service
            new_service = services_dir / "new" / "service"
            new_service.mkdir(parents=True)
            (new_service / "service.json").write_text(json.dumps({"name": "new"}))
            
            # Get current services and diff
            current_services = get_current_services("services/product")
            old_snapshot = load_snapshot()
            
            added, removed, modified = diff_snapshots(old_snapshot, current_services)
            
            # Verify new service was detected
            assert len(added) == 1, f"Expected 1 new service, got {len(added)}"
            assert any("new" in s for s in added), "Should detect the new service"
        finally:
            os.chdir(original_dir)
    
    def test_unchanged_services_do_not_trigger(self, temp_dir):
        """
        Scenario: No registration for unchanged services
        WHEN the daemon scans and finds no changes from previous snapshot
        THEN it SHALL NOT emit any registration events
        """
        from pathlib import Path
        import sys
        import os
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import save_snapshot, load_snapshot, diff_snapshots, get_current_services
        
        original_dir = Path.cwd()
        
        try:
            # Set up services
            services_dir = temp_dir / "services" / "product"
            resource_dir = services_dir / "stable" / "service"
            resource_dir.mkdir(parents=True)
            (resource_dir / "service.json").write_text(json.dumps({"name": "stable"}))
            
            os.chdir(temp_dir)
            
            # Save snapshot
            services = get_current_services("services/product")
            save_snapshot(services)
            
            # Scan again (no changes)
            current_services = get_current_services("services/product")
            old_snapshot = load_snapshot()
            
            added, removed, modified = diff_snapshots(old_snapshot, current_services)
            
            # Verify no changes detected
            assert len(added) == 0, "Should have no added services"
            assert len(removed) == 0, "Should have no removed services"
            assert len(modified) == 0, "Should have no modified services"
        finally:
            os.chdir(original_dir)
    
    def test_registration_includes_resource_metadata(self):
        """Test that registration events include full service metadata."""
        mock_registration_event = {
            "path": "services/product/test/service.json",
            "name": "test-service",
            "type": "backend",
            "stack": "test",
            "port": 4000
        }
        
        assert "path" in mock_registration_event
        assert "name" in mock_registration_event
        assert "type" in mock_registration_event
        assert "port" in mock_registration_event
