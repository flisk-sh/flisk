#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
ConfigService - File operations for Config Inspector
Handles safe file reading/writing with validation, backups, and conflict detection.
"""

import os
import hashlib
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, NamedTuple

from file_utils import PROJECT_ROOT, FileUtils


class SaveResult(NamedTuple):
    """Result of a save operation"""
    success: bool
    message: str
    backup_path: Optional[Path] = None
    error_details: Optional[str] = None


class ConfigService:
    """
    Service layer for config file operations.
    Separates file operations from HTTP handling.
    """
    
    # Allowed paths for write operations
    # NOTE: These are paths within the Flisk CLI installation
    ALLOWED_PATH_PREFIXES = [
        'engine/topologies/',
    ]
    
    # Master configs allowed at project root
    ALLOWED_ROOT_CONFIGS = [
        'TILT_RESOURCE_DEFAULTS.star',
        'spec.master',
        'engine/spec.master',
    ]
    
    # Allowed file extensions
    ALLOWED_EXTENSIONS = ['.star']
    
    # Special filenames that are allowed without extension check
    ALLOWED_FILENAMES = ['spec.master']
    
    # File size limits
    MAX_FILE_SIZE = 1024 * 1024  # 1MB
    MAX_CONTENT_LENGTH = 1024 * 1024  # 1MB for request body
    
    # Backup settings
    BACKUP_DIR_NAME = '.backups'
    MAX_BACKUPS = 3
    
    @staticmethod
    def validate_write_path(path: str) -> Optional[Path]:
        """
        Validate that a file path is safe for writing.
        
        Security: Prevents path traversal attacks by using os.path.realpath()
        and ensuring the resolved path is within allowed directories.
        
        Allowed paths:
        - Within engine/topologies/
        - Project root master configs: TILT_RESOURCE_DEFAULTS.star, spec.master, engine/spec.master
        
        Returns: Absolute Path if valid, None if invalid.
        """
        try:
            # Handle relative paths
            if not path.startswith('/'):
                target = PROJECT_ROOT / path
            else:
                target = Path(path)
            
            # Resolve to absolute path using realpath (follows symlinks, removes ..)
            resolved = Path(os.path.realpath(target))
            project_root_real = Path(os.path.realpath(PROJECT_ROOT))
            
            # Check if path is within project root (prevent path traversal)
            try:
                resolved.relative_to(project_root_real)
            except ValueError:
                return None
            
            # Get the relative path from project root
            rel_path = resolved.relative_to(project_root_real)
            rel_path_str = str(rel_path)
            
            # Check if it's one of the allowed root configs
            if rel_path_str in ConfigService.ALLOWED_ROOT_CONFIGS:
                return resolved
            
            # Check if it's within allowed prefixes
            for prefix in ConfigService.ALLOWED_PATH_PREFIXES:
                if rel_path_str.startswith(prefix):
                    return resolved
            
            # Path is not in any allowed location
            return None
            
        except (ValueError, OSError, RuntimeError):
            return None
    
    @staticmethod
    def validate_file_type(path: str) -> Tuple[bool, str]:
        """
        Validate that a file has an allowed extension or filename.
        
        Allowed:
        - Files with .star extension
        - Files named exactly 'spec.master'
        
        Returns: (is_valid, message)
        """
        path_obj = Path(path)
        filename = path_obj.name
        extension = path_obj.suffix.lower()
        
        # Check if filename is in allowed list (spec.master)
        if filename in ConfigService.ALLOWED_FILENAMES:
            return True, "Valid"
        
        # Check extension
        if extension in ConfigService.ALLOWED_EXTENSIONS:
            return True, "Valid"
        
        return False, f"Invalid file type: only {', '.join(ConfigService.ALLOWED_EXTENSIONS)} and {', '.join(ConfigService.ALLOWED_FILENAMES)} are allowed"
    
    @staticmethod
    def check_file_size(path: Path) -> Tuple[bool, str]:
        """
        Check if a file size is within the allowed limit.
        
        Returns: (is_valid, message)
        """
        try:
            if not path.exists():
                # For new files, this is ok
                return True, "Valid"
            
            size = path.stat().st_size
            if size > ConfigService.MAX_FILE_SIZE:
                return False, f"File too large: {size / (1024*1024):.1f}MB (max {ConfigService.MAX_FILE_SIZE / (1024*1024):.1f}MB)"
            
            return True, "Valid"
        except (OSError, IOError) as e:
            return False, f"Cannot check file size: {e}"
    
    @staticmethod
    def compute_content_hash(content: str) -> str:
        """
        Compute SHA-256 hash of content for conflict detection.
        
        Returns: Hex digest of the hash.
        """
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    @staticmethod
    def check_conflict(path: Path, original_hash: str) -> Tuple[bool, str]:
        """
        Check if file has been modified since it was loaded (conflict detection).
        
        Uses SHA-256 content hash comparison instead of timestamps to avoid TOCTOU race conditions.
        
        Args:
            path: Path to the file
            original_hash: SHA-256 hash of the content when it was loaded
            
        Returns: (has_conflict, message)
            - has_conflict: True if file has changed, False if it matches original_hash
            - message: Human-readable description
        """
        try:
            if not path.exists():
                return True, "File has been deleted"
            
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                current_content = f.read()
            
            current_hash = ConfigService.compute_content_hash(current_content)
            
            if current_hash != original_hash:
                return True, "File has been modified by another process"
            
            return False, "No conflict detected"
            
        except Exception as e:
            return True, f"Cannot check for conflicts: {e}"
    
    @staticmethod
    def create_backup_with_rotation(file_path: Path, max_backups: int = MAX_BACKUPS) -> Tuple[Optional[Path], str]:
        """
        Create a backup of a file with rotation (keep only last N backups).
        
        Backups are stored in a .backups/ subdirectory next to the file.
        Old backups are automatically deleted when exceeding max_backups.
        
        Args:
            file_path: Path to the file to backup
            max_backups: Maximum number of backups to keep (default: 3)
            
        Returns: (backup_path, message)
            - backup_path: Path to the created backup, or None if backup failed
            - message: Description of what happened
        """
        try:
            if not file_path.exists():
                return None, "File does not exist, no backup needed"
            
            # Create backup directory
            backup_dir = file_path.parent / ConfigService.BACKUP_DIR_NAME
            backup_dir.mkdir(exist_ok=True)
            
            # Generate backup filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{file_path.name}.{timestamp}.backup"
            backup_path = backup_dir / backup_name
            
            # Copy file to backup
            import shutil
            shutil.copy2(file_path, backup_path)
            
            # Clean up old backups
            existing_backups = sorted(
                backup_dir.glob(f"{file_path.name}.*.backup"),
                key=lambda p: p.stat().st_mtime,
                reverse=True  # Newest first
            )
            
            # Remove excess backups
            removed_count = 0
            for old_backup in existing_backups[max_backups:]:
                old_backup.unlink()
                removed_count += 1
            
            msg = f"Backup created: {backup_path.name}"
            if removed_count > 0:
                msg += f" (removed {removed_count} old backup(s))"
            
            return backup_path, msg
            
        except Exception as e:
            return None, f"Failed to create backup: {e}"
    
    @staticmethod
    def atomic_write(file_path: Path, content: str, original_hash: str = None, 
                     create_backup: bool = True) -> SaveResult:
        """
        Atomically write content to a file with backup and conflict detection.
        
        Uses write-to-temp-then-rename pattern for atomic writes.
        If the write fails, the temp file is preserved for recovery.
        
        Args:
            file_path: Path to write to
            content: Content to write
            original_hash: If provided, check for conflicts before writing (SHA-256 hash)
            create_backup: Whether to create a backup before writing (default: True)
            
        Returns: SaveResult with success status, message, and details
        """
        temp_file = None
        
        try:
            # Validate file size
            content_bytes = content.encode('utf-8')
            if len(content_bytes) > ConfigService.MAX_FILE_SIZE:
                return SaveResult(
                    success=False,
                    message=f"Content too large: {len(content_bytes) / (1024*1024):.1f}MB",
                    error_details=f"Maximum file size is {ConfigService.MAX_FILE_SIZE / (1024*1024):.1f}MB"
                )
            
            # Check for conflicts if hash provided
            if original_hash and file_path.exists():
                has_conflict, conflict_msg = ConfigService.check_conflict(file_path, original_hash)
                if has_conflict:
                    return SaveResult(
                        success=False,
                        message=f"Conflict detected: {conflict_msg}",
                        error_details="The file has been modified since you loaded it. Please reload and try again."
                    )
            
            # Create backup if requested and file exists
            backup_path = None
            backup_msg = ""
            if create_backup and file_path.exists():
                backup_path, backup_msg = ConfigService.create_backup_with_rotation(file_path)
                if backup_path is None:
                    # Backup failed but we can still try to write
                    backup_msg = "Warning: Backup creation failed, but continuing with write"
            
            # Atomic write: write to temp file, then rename
            temp_fd, temp_path = tempfile.mkstemp(
                dir=file_path.parent,
                prefix=f".tmp_{file_path.name}_",
                suffix='.tmp'
            )
            temp_file = Path(temp_path)
            
            try:
                # Write content to temp file
                with os.fdopen(temp_fd, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                # Ensure data is written to disk
                os.fsync(temp_fd)
                
                # Atomic rename (POSIX guarantees this is atomic)
                temp_file.rename(file_path)
                
                # Sync parent directory to ensure rename is persisted
                dir_fd = os.open(file_path.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(dir_fd)
                finally:
                    os.close(dir_fd)
                
                success_msg = "File saved successfully"
                if backup_msg:
                    success_msg += f". {backup_msg}"
                
                return SaveResult(
                    success=True,
                    message=success_msg,
                    backup_path=backup_path
                )
                
            except Exception as e:
                # If rename failed, temp file still exists for recovery
                return SaveResult(
                    success=False,
                    message=f"Failed to write file: {e}",
                    error_details=f"Temp file preserved at: {temp_file}" if temp_file.exists() else None
                )
                
        except Exception as e:
            return SaveResult(
                success=False,
                message=f"Unexpected error during save: {e}",
                error_details=str(e)
            )
        
        finally:
            # Clean up temp file if it still exists (shouldn't happen on success)
            if temp_file and temp_file.exists():
                try:
                    temp_file.unlink()
                except (OSError, PermissionError):
                    pass  # Best effort cleanup
    
    @staticmethod
    def validate_request_content_length(content_length: Optional[str]) -> Tuple[bool, str]:
        """
        Validate Content-Length header to prevent DoS attacks.
        
        Returns: (is_valid, message)
        """
        if content_length is None:
            return False, "Missing Content-Length header"
        
        try:
            length = int(content_length)
            if length < 0:
                return False, "Invalid Content-Length (negative)"
            if length > ConfigService.MAX_CONTENT_LENGTH:
                return False, f"Content too large: {length} bytes (max {ConfigService.MAX_CONTENT_LENGTH})"
            return True, "Valid"
        except ValueError:
            return False, "Invalid Content-Length header"
    
    @staticmethod
    def validate_csrf_token(token: str, referer: Optional[str], origin: Optional[str]) -> Tuple[bool, str]:
        """
        Validate CSRF protection token.
        
        Checks:
        - Token is non-empty
        - Referer or Origin header is from localhost
        
        Returns: (is_valid, message)
        """
        if not token or len(token) < 8:
            return False, "Invalid or missing CSRF token"
        
        # Check that request comes from localhost
        allowed_hosts = ['localhost', '127.0.0.1', '[::1]']
        
        referer_valid = False
        if referer:
            referer_lower = referer.lower()
            if any(host in referer_lower for host in allowed_hosts):
                referer_valid = True
        
        origin_valid = False
        if origin:
            origin_lower = origin.lower()
            if any(host in origin_lower for host in allowed_hosts):
                origin_valid = True
        
        if not (referer_valid or origin_valid):
            return False, "Invalid origin - request must come from localhost"
        
        return True, "Valid"
    
    @staticmethod
    def generate_csrf_token() -> str:
        """Generate a new CSRF token."""
        import secrets
        return secrets.token_urlsafe(32)


# Backwards compatibility: extend FileUtils with ConfigService methods
FileUtils.validate_write_path = staticmethod(ConfigService.validate_write_path)
FileUtils.validate_file_type = staticmethod(ConfigService.validate_file_type)
FileUtils.atomic_write = staticmethod(ConfigService.atomic_write)
FileUtils.create_backup_with_rotation = staticmethod(ConfigService.create_backup_with_rotation)
FileUtils.check_conflict = staticmethod(ConfigService.check_conflict)
FileUtils.compute_content_hash = staticmethod(ConfigService.compute_content_hash)


if __name__ == '__main__':
    # Quick tests
    print(f"Project root: {PROJECT_ROOT}")
    
    # Test validate_write_path
    test_paths = [
        'engine/topologies/tilt/discovery/registry.star',
        'TILT_RESOURCE_DEFAULTS.star',
        'spec.master',
        'engine/spec.master',
        '../outside',  # Should fail
        '/etc/passwd',  # Should fail
        'some/random/file.star',  # Should fail - not in allowed paths
        'README.md',  # Should fail - wrong extension
    ]
    
    print("\n=== Testing validate_write_path ===")
    for path in test_paths:
        result = ConfigService.validate_write_path(path)
        status = "✅ VALID" if result else "❌ INVALID"
        print(f"{status}: {path}")
    
    # Test validate_file_type
    print("\n=== Testing validate_file_type ===")
    test_files = [
        'engine/topologies/tilt.star',
        'spec.master',
        'README.md',
        'file.txt',
    ]
    for path in test_files:
        is_valid, msg = ConfigService.validate_file_type(path)
        status = "✅" if is_valid else "❌"
        print(f"{status}: {path} - {msg}")
    
    # Test hash computation
    print("\n=== Testing compute_content_hash ===")
    test_content = "Hello, World!"
    hash1 = ConfigService.compute_content_hash(test_content)
    hash2 = ConfigService.compute_content_hash(test_content)
    print(f"Content: '{test_content}'")
    print(f"Hash 1: {hash1[:16]}...")
    print(f"Hash 2: {hash2[:16]}...")
    print(f"Hashes match: {hash1 == hash2}")
