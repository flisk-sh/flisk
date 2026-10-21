# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for snapshot diff detection functionality.
Tests the comparison between old and new snapshots.
"""

import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path("discovery").resolve()))
from resource_snapshot import diff_snapshots


@pytest.mark.snapshot
class TestSnapshotDiff:
    """Tests for snapshot diff detection."""
    
    def test_detects_new_services(self):
        """
        Scenario: Detecting new services
        WHEN a new service.json file appears in a previously empty directory
        THEN the diff SHALL report "added" with the new service path and metadata
        """
        old = {"services": [], "count": 0}
        new = ["services/product/new/service.json"]
        
        added, removed, modified = diff_snapshots(old, new)
        
        assert added == {"services/product/new/service.json"}
        assert removed == set()
        assert modified == set()
    
    def test_detects_removed_services(self):
        """
        Scenario: Detecting removed services
        WHEN an existing service.json file is deleted
        THEN the diff SHALL report "removed" with the removed service path
        """
        old = {"services": ["services/product/old/service.json"], "count": 1}
        new = []
        
        added, removed, modified = diff_snapshots(old, new)
        
        assert added == set()
        assert removed == {"services/product/old/service.json"}
        assert modified == set()
    
    def test_detects_modified_services(self, temp_dir):
        """
        Scenario: Detecting modified services
        WHEN an existing service.json file changes its content (hash differs)
        THEN the diff SHALL report "modified" with the field changes and service path
        """
        import os
        original_dir = os.getcwd()
        
        try:
            os.chdir(temp_dir)
            
            # Create a service file
            resource_dir = temp_dir / "services" / "product" / "test"
            resource_dir.mkdir(parents=True)
            resource_file = resource_dir / "service.json"
            resource_file.write_text('{"name": "test", "version": "1.0.0"}')
            
            # Use relative path for service
            rel_path = "services/product/test/service.json"
            
            # Create old snapshot with hash of old content
            from resource_snapshot import compute_resource_hash
            old_hash = compute_resource_hash(rel_path)
            old = {
                "services": [rel_path],
                "count": 1,
                "resource_hashes": {rel_path: old_hash}
            }
            
            # Modify the file
            resource_file.write_text('{"name": "test", "version": "2.0.0"}')
            new = [rel_path]
            
            added, removed, modified = diff_snapshots(old, new, use_hashes=True)
            
            assert added == set()
            assert removed == set()
            assert modified == {rel_path}
        finally:
            os.chdir(original_dir)
    
    def test_no_changes_detected(self):
        """
        Scenario: No changes detected
        WHEN the filesystem matches the existing snapshot exactly
        THEN the diff SHALL report an empty changeset
        """
        old = {
            "services": [
                "services/product/a/service.json",
                "services/product/b/service.json"
            ],
            "count": 2,
            "hash": "abc123"  # This hash will mismatch, but individual hashes match
        }
        new = [
            "services/product/a/service.json",
            "services/product/b/service.json"
        ]
        
        # Without actual hash computation, should find no changes
        added, removed, modified = diff_snapshots(old, new, use_hashes=False)
        
        assert added == set()
        assert removed == set()
        assert modified == set()
    
    def test_detects_both_added_and_removed(self):
        """Test detecting simultaneous additions and removals."""
        old = {"services": ["a/service.json", "b/service.json"], "count": 2}
        new = ["b/service.json", "c/service.json"]
        
        added, removed, modified = diff_snapshots(old, new)
        
        assert added == {"c/service.json"}
        assert removed == {"a/service.json"}
        assert modified == set()
    
    def test_empty_to_multiple_services(self):
        """Test diff when going from empty to multiple services."""
        old = {"services": [], "count": 0}
        new = ["a/service.json", "b/service.json", "c/service.json"]
        
        added, removed, modified = diff_snapshots(old, new)
        
        assert added == {"a/service.json", "b/service.json", "c/service.json"}
        assert removed == set()
        assert modified == set()
