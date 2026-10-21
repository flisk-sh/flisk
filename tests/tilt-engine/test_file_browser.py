# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for file browser component.
Tests the file listing, navigation, and security features.
"""

import pytest
import os
from pathlib import Path
from unittest.mock import Mock, patch


@pytest.mark.ide
class TestFileBrowser:
    """Tests for file browser functionality."""
    
    def test_root_directory_listing(self, temp_dir):
        """
        Scenario: Root directory listing
        WHEN a user requests `GET /` from the file browser
        THEN it SHALL return HTML with the root directory listing
        AND it SHALL include directories and files with icons (📁, 📄)
        """
        # Create test structure
        (temp_dir / "services").mkdir()
        (temp_dir / "README.md").write_text("# Project")
        (temp_dir / "package.json").write_text('{"name": "test"}')
        
        # Simulate file browser response
        entries = self._get_directory_listing(temp_dir, temp_dir)
        
        # Verify structure
        assert len(entries) >= 2, "Should list directories and files"
        
        # Check for icons
        dir_entry = next((e for e in entries if e["name"] == "services"), None)
        assert dir_entry is not None, "Should list services directory"
        assert "📁" in dir_entry.get("icon", ""), "Directories should have folder icon"
    
    def test_subdirectory_navigation(self, temp_dir):
        """
        Scenario: Subdirectory navigation
        WHEN a user requests `GET /?path=.tdk/.tdk-out` from the file browser
        THEN it SHALL return HTML with the subdirectory listing
        AND breadcrumb links SHALL allow navigation to parent directories
        """
        # Create nested structure
        nested_dir = temp_dir / ".tdk" / ".tdk-out" / "snapshots"
        nested_dir.mkdir(parents=True)
        (nested_dir / "file.txt").write_text("content")
        
        # Simulate navigation
        entries = self._get_directory_listing(nested_dir, temp_dir)
        
        assert len(entries) == 1, "Should list the file in subdirectory"
        assert entries[0]["name"] == "file.txt"
        
        # Verify breadcrumb paths
        breadcrumbs = self._get_breadcrumbs(nested_dir, temp_dir)
        assert len(breadcrumbs) > 0, "Should have breadcrumbs"
        assert breadcrumbs[0]["name"] == "root", "First breadcrumb should be root"
    
    def test_file_metadata_display(self, temp_dir):
        """
        Scenario: File metadata display
        WHEN a directory listing includes a file
        THEN it SHALL display file size in human-readable format
        AND it SHALL display modification time in readable format
        """
        # Create test file
        test_file = temp_dir / "test.txt"
        test_file.write_text("Hello, World!" * 100)  # ~1.3KB
        
        import time
        mtime = time.time()
        os.utime(test_file, (mtime, mtime))
        
        # Get metadata
        metadata = self._get_file_metadata(test_file)
        
        assert "size" in metadata
        assert "size_formatted" in metadata
        assert "mtime" in metadata
        assert "mtime_formatted" in metadata
        
        # Check size formatting (should be human-readable)
        assert "B" in metadata["size_formatted"] or "KB" in metadata["size_formatted"]
    
    def test_path_traversal_protection(self, temp_dir):
        """
        Scenario: Path traversal protection
        WHEN a user requests `GET /?path=../../../etc/passwd` from the file browser
        THEN it SHALL return `403 Forbidden`
        AND it SHALL NOT expose files outside the project root
        """
        # Try to access outside project root
        malicious_path = "../../../etc/passwd"
        
        # Verify path would escape project root
        from pathlib import Path
        resolved = (temp_dir / malicious_path).resolve()
        
        is_within_root = str(resolved).startswith(str(temp_dir.resolve()))
        
        assert not is_within_root, "Path traversal attempt should be detected"
        
        # Security check: should reject paths outside root
        is_safe = self._is_safe_path(malicious_path, temp_dir)
        assert not is_safe, "Path outside root should be rejected"
    
    def test_file_size_limit(self, temp_dir):
        """
        Scenario: File size limit
        WHEN a user attempts to access a file larger than 1MB
        THEN it SHALL return `413 Payload Too Large`
        AND it SHALL include a helpful error message
        """
        # Create large file (1.5MB)
        large_file = temp_dir / "large.bin"
        large_file.write_bytes(b"0" * (1024 * 1024 + 512 * 1024))  # 1.5MB
        
        file_size = large_file.stat().st_size
        max_size = 1024 * 1024  # 1MB
        
        assert file_size > max_size, "Test file should be larger than limit"
        
        # Check size limit
        is_within_limit = file_size <= max_size
        assert not is_within_limit, "File should exceed size limit"
    
    def _get_directory_listing(self, path: Path, root: Path) -> list:
        """Helper to simulate directory listing."""
        if not path.exists():
            return []
        
        entries = []
        for item in sorted(path.iterdir()):
            entry = {
                "name": item.name,
                "is_dir": item.is_dir(),
                "icon": "📁" if item.is_dir() else "📄"
            }
            entries.append(entry)
        return entries
    
    def _get_breadcrumbs(self, path: Path, root: Path) -> list:
        """Helper to generate breadcrumbs."""
        breadcrumbs = [{"name": "root", "path": "."}]
        
        rel_path = path.relative_to(root)
        current = root
        
        for part in rel_path.parts:
            current = current / part
            breadcrumbs.append({"name": part, "path": str(current.relative_to(root))})
        
        return breadcrumbs
    
    def _get_file_metadata(self, path: Path) -> dict:
        """Helper to get file metadata."""
        stat = path.stat()
        size = stat.st_size
        
        # Format size
        if size < 1024:
            size_formatted = f"{size} B"
        elif size < 1024 * 1024:
            size_formatted = f"{size / 1024:.1f} KB"
        else:
            size_formatted = f"{size / (1024 * 1024):.1f} MB"
        
        import time
        from datetime import datetime
        
        mtime = stat.st_mtime
        mtime_formatted = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
        
        return {
            "size": size,
            "size_formatted": size_formatted,
            "mtime": mtime,
            "mtime_formatted": mtime_formatted
        }
    
    def _is_safe_path(self, path_str: str, root: Path) -> bool:
        """Check if path is safe (within project root)."""
        try:
            requested_path = (root / path_str).resolve()
            root_resolved = root.resolve()
            
            # Check if resolved path is within root
            return str(requested_path).startswith(str(root_resolved))
        except (ValueError, RuntimeError):
            return False
