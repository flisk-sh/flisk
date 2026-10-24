#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Automated tests for ConfigService
Tests path validation, file operations, backups, and security features.
"""

import os
import sys
import tempfile
import shutil
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))
from config_service import ConfigService, SaveResult


class TestConfigService:
    """Test suite for ConfigService"""
    
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.temp_dir = None
    
    def setup(self):
        """Create temporary test directory"""
        self.temp_dir = tempfile.mkdtemp()
        # Create structure mimicking project
        (Path(self.temp_dir) / '.tilt-engine' / 'topologies').mkdir(parents=True)
        (Path(self.temp_dir) / '.tilt-engine' / 'topologies' / 'test.star').write_text('# test')
        
        # Create root master configs
        (Path(self.temp_dir) / 'TILT_RESOURCE_DEFAULTS.star').write_text('# defaults')
        (Path(self.temp_dir) / 'spec.master').write_text('# spec')
        
        # Override PROJECT_ROOT for testing by patching the module directly
        import config_service
        self.original_root = config_service.PROJECT_ROOT
        config_service.PROJECT_ROOT = Path(self.temp_dir)
        # Also patch in file_utils
        import file_utils
        self.original_file_utils_root = file_utils.PROJECT_ROOT
        file_utils.PROJECT_ROOT = Path(self.temp_dir)
    
    def teardown(self):
        """Cleanup temporary directory"""
        # Restore original
        import config_service
        config_service.PROJECT_ROOT = self.original_root
        import file_utils
        file_utils.PROJECT_ROOT = self.original_file_utils_root
        
        if self.temp_dir and os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def assert_true(self, condition, msg):
        """Assert condition is true"""
        if condition:
            self.passed += 1
            print(f"  ✓ {msg}")
        else:
            self.failed += 1
            print(f"  ✗ {msg}")
    
    def assert_false(self, condition, msg):
        """Assert condition is false"""
        self.assert_true(not condition, msg)
    
    def assert_equals(self, a, b, msg):
        """Assert two values are equal"""
        if a == b:
            self.passed += 1
            print(f"  ✓ {msg}")
        else:
            self.failed += 1
            print(f"  ✗ {msg}: expected {b}, got {a}")
    
    def run_all_tests(self):
        """Run all test methods"""
        print("\n" + "="*60)
        print("ConfigService Test Suite")
        print("="*60)
        
        self.setup()
        try:
            self.test_path_validation()
            self.test_file_type_validation()
            self.test_hash_computation()
            self.test_backup_rotation()
            self.test_conflict_detection()
            self.test_atomic_write()
            self.test_csrf_validation()
            self.test_content_length_validation()
        finally:
            self.teardown()
        
        print("\n" + "="*60)
        print(f"Results: {self.passed} passed, {self.failed} failed")
        print("="*60)
        return self.failed == 0
    
    def test_path_validation(self):
        """Test 7.4, 7.10, 7.11: Path validation and traversal prevention"""
        print("\n📁 Testing Path Validation (Tasks 7.4, 7.10, 7.11)")
        
        # Valid paths - topologies
        valid_paths = [
            '.tilt-engine/topologies/test.star',
            '.tilt-engine/topologies/tilt/discovery/registry.star',
        ]
        
        for path in valid_paths:
            result = ConfigService.validate_write_path(path)
            self.assert_true(result is not None, f"Valid path accepted: {path}")
        
        # Valid paths - project root master configs (Task 7.11)
        root_configs = [
            'TILT_RESOURCE_DEFAULTS.star',
            'spec.master',
            '.tilt-engine/spec.master',
        ]
        
        for path in root_configs:
            result = ConfigService.validate_write_path(path)
            self.assert_true(result is not None, f"Root config accepted: {path}")
        
        # Invalid paths - traversal attempts
        invalid_paths = [
            '../outside.star',
            '.tilt-engine/../../etc/passwd',
            '%2e%2e%2fsecret.star',
            '/etc/passwd',
            'random/file.star',
            'README.md',
        ]
        
        for path in invalid_paths:
            result = ConfigService.validate_write_path(path)
            self.assert_true(result is None, f"Invalid path rejected: {path}")
    
    def test_file_type_validation(self):
        """Test 7.12: File extension validation"""
        print("\n📄 Testing File Type Validation (Task 7.12)")
        
        # Valid file types
        valid_files = [
            'test.star',
            'spec.master',
            '.tilt-engine/spec.master',
            'TILT_RESOURCE_DEFAULTS.star',
        ]
        
        for path in valid_files:
            is_valid, _ = ConfigService.validate_file_type(path)
            self.assert_true(is_valid, f"Valid file type: {path}")
        
        # Invalid file types
        invalid_files = [
            'README.md',
            'file.txt',
            'script.py',
            'config.json',
        ]
        
        for path in invalid_files:
            is_valid, _ = ConfigService.validate_file_type(path)
            self.assert_false(is_valid, f"Invalid file type rejected: {path}")
    
    def test_hash_computation(self):
        """Test 7.9: Hash computation for conflict detection"""
        print("\n🔐 Testing Hash Computation (Task 7.9)")
        
        # Same content produces same hash
        content1 = "Hello, World!"
        hash1 = ConfigService.compute_content_hash(content1)
        hash2 = ConfigService.compute_content_hash(content1)
        self.assert_equals(hash1, hash2, "Same content produces same hash")
        
        # Different content produces different hash
        content2 = "Hello, World"
        hash3 = ConfigService.compute_content_hash(content2)
        self.assert_true(hash1 != hash3, "Different content produces different hash")
        
        # Hash is SHA-256 (64 hex characters)
        self.assert_equals(len(hash1), 64, "Hash is 64 hex chars (SHA-256)")
    
    def test_backup_rotation(self):
        """Test 7.8: Backup creation and rotation"""
        print("\n💾 Testing Backup Rotation (Task 7.8)")
        
        import time
        
        # Create test file
        test_file = Path(self.temp_dir) / '.tilt-engine' / 'topologies' / 'backup_test.star'
        test_file.write_text('version 1')
        
        # Create multiple backups with small delays to ensure different timestamps
        for i in range(5):
            time.sleep(0.01)  # Small delay to ensure different timestamps
            test_file.write_text(f'version {i+2}')
            backup_path, msg = ConfigService.create_backup_with_rotation(test_file, max_backups=3)
            self.assert_true(backup_path is not None, f"Backup {i+1} created: {msg}")
        
        # Check only 3 backups exist
        backup_dir = test_file.parent / '.backups'
        if backup_dir.exists():
            backups = list(backup_dir.glob('backup_test.star.*.backup'))
            self.assert_true(len(backups) <= 3, f"Rotation keeps max 3 backups (found {len(backups)})")
        else:
            self.assert_true(False, "Backup directory should exist")
    
    def test_conflict_detection(self):
        """Test 7.9: File content hash conflict detection"""
        print("\n⚠️  Testing Conflict Detection (Task 7.9)")
        
        # Create test file
        test_file = Path(self.temp_dir) / '.tilt-engine' / 'topologies' / 'conflict_test.star'
        original_content = "Original content"
        test_file.write_text(original_content)
        
        # Get original hash
        original_hash = ConfigService.compute_content_hash(original_content)
        
        # No conflict when file unchanged
        has_conflict, msg = ConfigService.check_conflict(test_file, original_hash)
        self.assert_false(has_conflict, "No conflict when file unchanged")
        
        # Modify file
        test_file.write_text("Modified content")
        
        # Conflict detected after modification
        has_conflict, msg = ConfigService.check_conflict(test_file, original_hash)
        self.assert_true(has_conflict, "Conflict detected after file modification")
    
    def test_atomic_write(self):
        """Test 7.7, 7.20: Atomic write and failure recovery"""
        print("\n📝 Testing Atomic Write (Tasks 7.7, 7.20)")
        
        # Use relative path that will pass validation
        rel_path = '.tilt-engine/topologies/atomic_test.star'
        abs_path = Path(self.temp_dir) / rel_path
        
        # Verify path validation works
        validated = ConfigService.validate_write_path(rel_path)
        self.assert_true(validated is not None, "Path validation for atomic write")
        
        # Test successful write (using relative path)
        result = ConfigService.atomic_write(validated, "Test content", create_backup=False)
        self.assert_true(result.success, f"Atomic write succeeds: {result.message}")
        self.assert_true(abs_path.exists(), "File created")
        self.assert_equals(abs_path.read_text(), "Test content", "Content written correctly")
        
        # Test write with backup
        result = ConfigService.atomic_write(validated, "Updated content", create_backup=True)
        self.assert_true(result.success, f"Atomic write with backup succeeds: {result.message}")
        self.assert_true(result.backup_path is not None, "Backup created")
        
        # Test conflict detection during write
        original_hash = ConfigService.compute_content_hash("Wrong hash")
        result = ConfigService.atomic_write(
            validated, 
            "New content", 
            original_hash=original_hash,
            create_backup=False
        )
        self.assert_false(result.success, "Write fails with hash conflict")
    
    def test_csrf_validation(self):
        """Test 7.13: CSRF protection"""
        print("\n🛡️  Testing CSRF Protection (Task 7.13)")
        
        # Valid token with localhost origin
        is_valid, _ = ConfigService.validate_csrf_token(
            "valid_token_12345",
            referer="http://localhost:9767/",
            origin="http://localhost:9767"
        )
        self.assert_true(is_valid, "Valid CSRF token with localhost origin")
        
        # Invalid token (too short)
        is_valid, _ = ConfigService.validate_csrf_token(
            "short",
            referer="http://localhost:9767/",
            origin="http://localhost:9767"
        )
        self.assert_false(is_valid, "Short token rejected")
        
        # Valid token but wrong origin
        is_valid, _ = ConfigService.validate_csrf_token(
            "valid_token_12345",
            referer="https://evil.com/",
            origin="https://evil.com"
        )
        self.assert_false(is_valid, "Wrong origin rejected")
    
    def test_content_length_validation(self):
        """Test content length limits"""
        print("\n📏 Testing Content Length Validation")
        
        # Valid content length
        is_valid, _ = ConfigService.validate_request_content_length("1024")
        self.assert_true(is_valid, "Valid content length accepted")
        
        # Too large
        is_valid, _ = ConfigService.validate_request_content_length(str(2 * 1024 * 1024))
        self.assert_false(is_valid, "Oversized content rejected")
        
        # Missing
        is_valid, _ = ConfigService.validate_request_content_length(None)
        self.assert_false(is_valid, "Missing content length rejected")
        
        # Invalid format
        is_valid, _ = ConfigService.validate_request_content_length("invalid")
        self.assert_false(is_valid, "Invalid content length rejected")


def run_tests():
    """Run all tests and return exit code"""
    tester = TestConfigService()
    success = tester.run_all_tests()
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(run_tests())
