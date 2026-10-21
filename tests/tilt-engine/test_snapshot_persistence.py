# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for snapshot persistence functionality.
Tests saving and loading snapshots from the filesystem.
"""

import json
import os
import pytest
from pathlib import Path


@pytest.mark.snapshot
class TestSnapshotPersistence:
    """Tests for snapshot save/load operations."""
    
    def test_saving_snapshot_creates_file(self, temp_dir):
        """
        Scenario: Saving snapshot creates file
        WHEN a snapshot is saved to `.tdk/.tdk-out/snapshots/resource-snapshot.json`
        THEN the file SHALL exist with valid JSON containing all service data
        """
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import save_snapshot
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            services = [
                "services/product/a/service.json",
                "services/product/b/service.json"
            ]
            save_snapshot(services)
            
            snapshot_file = Path(".tdk/.tdk-out/snapshots/resource-snapshot.json")
            assert snapshot_file.exists(), "Snapshot file should be created"
            
            # Verify content
            with open(snapshot_file) as f:
                data = json.load(f)
                assert data["count"] == 2
                assert data["services"] == services
                assert "timestamp" in data
                assert "hash" in data
        finally:
            os.chdir(original_dir)
    
    def test_loading_snapshot_reads_file(self, temp_dir):
        """
        Scenario: Loading snapshot reads file
        WHEN a snapshot is loaded from an existing `.tdk/.tdk-out/snapshots/resource-snapshot.json`
        THEN it SHALL return the previously saved service data
        """
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import save_snapshot, load_snapshot
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            # Create a snapshot first
            services = ["services/product/test/service.json"]
            save_snapshot(services)
            
            # Load it
            snapshot = load_snapshot()
            
            assert snapshot["count"] == 1
            assert snapshot["services"] == services
            assert "timestamp" in snapshot
        finally:
            os.chdir(original_dir)
    
    def test_loading_missing_snapshot(self, temp_dir):
        """
        Scenario: Loading missing snapshot
        WHEN a snapshot is loaded from a non-existent `.tdk/.tdk-out/snapshots/resource-snapshot.json`
        THEN it SHALL return an empty list without error
        """
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import load_snapshot
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            snapshot = load_snapshot()
            
            assert snapshot["count"] == 0
            assert snapshot["services"] == []
            assert snapshot["timestamp"] is None
        finally:
            os.chdir(original_dir)
    
    def test_saving_creates_directory_structure(self, temp_dir):
        """Test that saving creates the .tdk/.tdk-out/snapshots directory if it doesn't exist."""
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import save_snapshot
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            services = ["services/test/service.json"]
            save_snapshot(services)
            
            assert Path(".tdk/.tdk-out/snapshots").exists(), ".tdk/.tdk-out/snapshots directory should be created"
            assert Path(".tdk/.tdk-out/snapshots").is_dir(), ".tdk/.tdk-out/snapshots should be a directory"
        finally:
            os.chdir(original_dir)
    
    def test_loading_invalid_json_returns_empty(self, temp_dir):
        """Test that loading invalid JSON returns empty snapshot."""
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import load_snapshot
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            # Create invalid JSON file
            Path(".tilt").mkdir(parents=True, exist_ok=True)
            with open(".tilt/resource-snapshot.json", "w") as f:
                f.write("not valid json {{{")
            
            snapshot = load_snapshot()
            
            assert snapshot["count"] == 0
            assert snapshot["services"] == []
        finally:
            os.chdir(original_dir)
    
    def test_snapshot_includes_hashes(self, temp_dir):
        """Test that saved snapshot includes content hashes."""
        import sys
        sys.path.insert(0, str(Path("discovery").resolve()))
        from resource_snapshot import save_snapshot
        
        # Create a service file to hash
        resource_dir = temp_dir / "services" / "test"
        resource_dir.mkdir(parents=True)
        (resource_dir / "service.json").write_text('{"name": "test"}')
        
        original_dir = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            services = ["services/test/service.json"]
            save_snapshot(services, include_hashes=True)
            
            with open(".tdk/.tdk-out/snapshots/resource-snapshot.json") as f:
                data = json.load(f)
                
            assert "resource_hashes" in data
            assert "services/test/service.json" in data["resource_hashes"]
            assert len(data["resource_hashes"]["services/test/service.json"]) == 16
        finally:
            os.chdir(original_dir)
