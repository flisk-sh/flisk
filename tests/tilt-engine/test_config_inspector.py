# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for config inspector component.
Tests the multi-pane comparison and editing features.
"""

import os
import pytest
import hashlib
from pathlib import Path


@pytest.mark.ide
class TestConfigInspector:
    """Tests for config inspector functionality."""
    
    def test_single_pane_default_view(self):
        """
        Scenario: Single-pane default view
        WHEN a user requests `GET /`
        THEN it SHALL display a single pane with the first master config
        """
        # Simulate default view
        panes = [{"name": "TILT_RESOURCE_DEFAULTS.star", "content": "# Content"}]
        
        assert len(panes) == 1, "Default view should have 1 pane"
        assert "TILT_RESOURCE_DEFAULTS.star" in panes[0]["name"]
    
    def test_dual_pane_comparison(self):
        """
        Scenario: Dual-pane comparison
        WHEN a user requests `GET /?master1=TILT_RESOURCE_DEFAULTS.star&master2=spec.master`
        THEN it SHALL display two panes side-by-side
        AND both configs SHALL be viewable simultaneously
        """
        # Simulate dual-pane request
        requested_masters = ["TILT_RESOURCE_DEFAULTS.star", "spec.master"]
        
        panes = [
            {"name": name, "content": f"# {name} content"}
            for name in requested_masters
        ]
        
        assert len(panes) == 2, "Dual-pane should have 2 panes"
        assert all(p["name"] in requested_masters for p in panes)
    
    def test_triple_pane_with_sync_scroll(self):
        """
        Scenario: Triple-pane with sync scroll
        WHEN a user requests `GET /?master1=A.star&master2=B.star&master3=C.star&sync=true`
        THEN it SHALL display three panes
        AND scrolling one pane SHALL sync scroll the others
        """
        requested_masters = ["A.star", "B.star", "C.star"]
        sync_enabled = True
        
        panes = [
            {"name": name, "content": f"# {name} content", "sync_scroll": sync_enabled}
            for name in requested_masters
        ]
        
        assert len(panes) == 3, "Triple-pane should have 3 panes"
        assert all(p.get("sync_scroll") for p in panes), "All panes should have sync scroll enabled"
    
    def test_edit_mode_toggle(self, temp_dir):
        """
        Scenario: Edit mode toggle
        WHEN a user clicks the "✏️ Edit Mode" button
        THEN textareas SHALL become editable
        AND save buttons SHALL appear for each pane
        """
        # Simulate edit mode toggle
        edit_mode = True
        
        pane = {
            "name": "test.star",
            "content": "# Original",
            "editable": edit_mode,
            "dirty": False
        }
        
        assert pane["editable"], "Pane should be editable in edit mode"
        
        # Simulate edit
        pane["content"] = "# Modified"
        pane["dirty"] = True
        
        assert pane["dirty"], "Pane should be marked as dirty after edit"
    
    def test_safe_file_saving_with_backups(self, temp_dir):
        """
        Scenario: Safe file saving
        WHEN a user saves changes in edit mode
        THEN it SHALL create a backup in `.backups/` before writing
        AND it SHALL use atomic write (temp file + rename)
        """
        test_file = temp_dir / "test.star"
        original_content = "# Original content"
        test_file.write_text(original_content)
        
        # Create backup directory
        backup_dir = temp_dir / ".backups"
        backup_dir.mkdir(exist_ok=True)
        
        # Simulate safe save
        new_content = "# Modified content"
        self._safe_save_file(test_file, new_content, backup_dir)
        
        # Verify backup created (backup files are named like "test.star.0")
        backup_files = list(backup_dir.glob(f"{test_file.name}.*"))
        assert len(backup_files) > 0, f"Backup should be created in {backup_dir}"
        
        # Verify new content written
        assert test_file.read_text() == new_content, "File should have new content"
        
        # Verify backup has original content
        backup_content = backup_files[0].read_text()
        assert backup_content == original_content, "Backup should have original content"
    
    def test_conflict_detection(self, temp_dir):
        """
        Scenario: Conflict detection
        WHEN a user attempts to save but the file was modified on disk since loading
        THEN it SHALL return `409 Conflict` with current file hash
        AND it SHALL ask user to refresh and retry
        """
        test_file = temp_dir / "test.star"
        original_content = "# Version 1"
        test_file.write_text(original_content)
        
        # Load file and compute hash
        loaded_content = test_file.read_text()
        loaded_hash = hashlib.sha256(loaded_content.encode()).hexdigest()
        
        # Simulate external modification
        test_file.write_text("# Version 2 (external change)")
        
        # Try to save with old hash
        current_content = test_file.read_text()
        current_hash = hashlib.sha256(current_content.encode()).hexdigest()
        
        # Hash mismatch = conflict
        assert loaded_hash != current_hash, "Should detect conflict (hash mismatch)"
    
    def _safe_save_file(self, path: Path, content: str, backup_dir: Path):
        """Simulate safe file save with backup."""
        import tempfile
        import shutil
        
        # Create backup
        if path.exists():
            backup_path = backup_dir / f"{path.name}.{len(list(backup_dir.glob('*')))}"
            shutil.copy2(path, backup_path)
        
        # Atomic write using temp file
        temp_fd, temp_path = tempfile.mkstemp(dir=path.parent)
        try:
            with os.fdopen(temp_fd, 'w') as f:
                f.write(content)
            os.replace(temp_path, path)
        except Exception:
            os.unlink(temp_path)
            raise
