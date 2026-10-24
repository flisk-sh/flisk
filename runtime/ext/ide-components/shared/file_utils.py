#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Shared file utilities for Tilt IDE components
"""

import os
import sys
from pathlib import Path
from typing import Optional, List, Tuple

# Flisk CLI root directory (5 levels up from this file: ext/ide-components/shared/)
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent.parent
MAX_FILE_SIZE = 1024 * 1024  # 1MB


class FileUtils:
    """Safe file operations for IDE components"""
    
    @staticmethod
    def validate_path(path: str) -> Optional[Path]:
        """
        Validate and sanitize a file path.
        Returns absolute Path if valid, None if invalid.
        
        Security: Prevents path traversal attacks by ensuring
        the resolved path is within the project root.
        """
        try:
            # Handle relative paths
            if not path.startswith('/'):
                target = PROJECT_ROOT / path
            else:
                target = Path(path)
            
            # Resolve to absolute, removing .. and symlinks
            resolved = target.resolve()
            
            # Ensure within project root
            try:
                resolved.relative_to(PROJECT_ROOT.resolve())
            except ValueError:
                return None
            
            return resolved
        except (ValueError, OSError, RuntimeError):
            return None
    
    @staticmethod
    def get_file_info(file_path: Path) -> dict:
        """Get file metadata for display"""
        stat = file_path.stat()
        size = stat.st_size
        
        # Human-readable size
        if size < 1024:
            size_str = f"{size} B"
        elif size < 1024 * 1024:
            size_str = f"{size / 1024:.1f} KB"
        else:
            size_str = f"{size / (1024 * 1024):.1f} MB"
        
        # Modified time
        from datetime import datetime
        mtime = datetime.fromtimestamp(stat.st_mtime)
        mtime_str = mtime.strftime("%Y-%m-%d %H:%M")
        
        # File type icon
        ext = file_path.suffix.lower()
        icon = FileUtils.get_file_icon(ext, file_path.is_dir(), file_path.name)
        
        return {
            'name': file_path.name,
            'path': str(file_path.relative_to(PROJECT_ROOT)),
            'size': size,
            'size_str': size_str,
            'modified': mtime_str,
            'is_dir': file_path.is_dir(),
            'icon': icon,
            'extension': ext,
        }
    
    @staticmethod
    def get_file_icon(ext: str, is_dir: bool, filename: str = '') -> str:
        """Get emoji icon for file type"""
        if is_dir:
            if filename.startswith('.'):
                return '🔒'
            if filename in ('node_modules', 'vendor', '__pycache__'):
                return '📦'
            return '📁'
        
        # Check special filenames first (exact match)
        special_icons = {
            'Makefile': '🔨',
            'README': '📖',
            'LICENSE': '📜',
            'Dockerfile': '🐳',
            'docker-compose.yml': '🐳',
            'docker-compose.yaml': '🐳',
            '.gitignore': '🚫',
            'go.mod': '🔵',
            'go.sum': '🔵',
            'Cargo.toml': '🦀',
            'Cargo.lock': '🦀',
            'package.json': '⬡',
            'package-lock.json': '⬡',
            'requirements.txt': '🐍',
            'setup.py': '🐍',
        }
        
        if filename in special_icons:
            return special_icons[filename]
        
        icons = {
            '.ts': '📘', '.tsx': '📘',
            '.js': '📒', '.jsx': '📒',
            '.mjs': '📒', '.cjs': '📒',
            '.json': '📋',
            '.yaml': '📋', '.yml': '📋',
            '.star': '⭐',
            '.py': '🐍',
            '.pyc': '🐍',
            '.pyo': '🐍',
            '.ipynb': '📓',
            '.md': '📝',
            '.mdx': '📝',
            '.txt': '📄',
            '.prisma': '🗃️',
            '.dockerfile': '🐳', '.docker': '🐳',
            '.sh': '🔧',
            '.bash': '🔧',
            '.zsh': '🔧',
            '.fish': '🔧',
            '.css': '🎨', '.scss': '🎨', '.sass': '🎨', '.less': '🎨',
            '.html': '🌐', '.htm': '🌐', '.xhtml': '🌐',
            '.vue': '💚',
            '.svelte': '🧡',
            '.conf': '⚙️', '.config': '⚙️', '.cfg': '⚙️',
            '.ini': '⚙️',
            '.toml': '⚙️',
            '.env': '🔐',
            '.env.local': '🔐', '.env.production': '🔐', '.env.development': '🔐',
            '.sql': '🗄️',
            '.go': '🔵',
            '.rs': '🦀',
            '.java': '☕',
            '.class': '☕',
            '.jar': '☕',
            '.kt': '💜',
            '.swift': '🦅',
            '.rb': '💎',
            '.php': '🐘',
            '.c': '🇨',
            '.cpp': '🇨🇵',
            '.cc': '🇨🇵',
            '.h': '📋',
            '.hpp': '📋',
            '.zig': '⚡',
            '.lua': '🌙',
            '.r': '📊',
            '.R': '📊',
            '.lock': '🔒',
        }
        
        return icons.get(ext, '📄')
    
    @staticmethod
    def read_file_safe(file_path: str, max_size: int = MAX_FILE_SIZE) -> Tuple[Optional[str], Optional[str]]:
        """
        Safely read a file with size limit.
        
        Returns: (content, error_message)
        - If success: (content, None)
        - If error: (None, error_message)
        """
        resolved = FileUtils.validate_path(file_path)
        
        if not resolved:
            return None, "Invalid path or access denied"
        
        if not resolved.exists():
            return None, f"File not found: {file_path}"
        
        if resolved.is_dir():
            return None, "Path is a directory, not a file"
        
        # Check size
        size = resolved.stat().st_size
        if size > max_size:
            return None, f"File too large ({size / (1024*1024):.1f} MB > {max_size / (1024*1024):.1f} MB limit)"
        
        try:
            with open(resolved, 'r', encoding='utf-8', errors='replace') as f:
                return f.read(), None
        except Exception as e:
            return None, f"Error reading file: {str(e)}"
    
    @staticmethod
    def list_directory(dir_path: str) -> Tuple[Optional[List[dict]], Optional[str]]:
        """
        List directory contents safely.
        
        Returns: (items, error_message)
        """
        resolved = FileUtils.validate_path(dir_path)
        
        if not resolved:
            return None, "Invalid path or access denied"
        
        if not resolved.exists():
            return None, f"Directory not found: {dir_path}"
        
        if not resolved.is_dir():
            return None, "Path is not a directory"
        
        try:
            items = []
            for entry in sorted(resolved.iterdir()):
                # Skip hidden files
                if entry.name.startswith('.'):
                    continue
                items.append(FileUtils.get_file_info(entry))
            return items, None
        except Exception as e:
            return None, f"Error reading directory: {str(e)}"
    
    @staticmethod
    def search_files(query: str, max_results: int = 50) -> List[dict]:
        """
        Search for files by name across the project.
        
        Returns list of matching file info dicts.
        """
        results = []
        query_lower = query.lower()
        
        try:
            for root, dirs, files in os.walk(PROJECT_ROOT):
                # Skip hidden directories and common ignores
                dirs[:] = [d for d in dirs if not d.startswith('.') and 
                          d not in ('node_modules', 'dist', 'build', '.git', '__pycache__', 'coverage')]
                
                for name in files:
                    if query_lower in name.lower():
                        file_path = Path(root) / name
                        try:
                            info = FileUtils.get_file_info(file_path)
                            results.append(info)
                            if len(results) >= max_results:
                                return results
                        except (OSError, PermissionError):
                            continue
                        
        except Exception:
            pass
        
        return results
    
    @staticmethod
    def get_language_from_ext(ext: str) -> str:
        """Get language identifier from file extension"""
        languages = {
            '.ts': 'typescript', '.tsx': 'typescript',
            '.js': 'javascript', '.jsx': 'javascript',
            '.json': 'json',
            '.yaml': 'yaml', '.yml': 'yaml',
            '.star': 'python',  # Starlark is Python-like
            '.py': 'python',
            '.md': 'markdown',
            '.prisma': 'prisma',
            '.dockerfile': 'dockerfile',
            '.sh': 'bash',
            '.css': 'css', '.scss': 'scss', '.less': 'less',
            '.html': 'html', '.htm': 'html',
            '.sql': 'sql',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
        }
        
        return languages.get(ext, 'text')


if __name__ == '__main__':
    # Quick test
    print(f"Project root: {PROJECT_ROOT}")
    
    # Test validate_path
    test_paths = [
        '.',
        'services/product/staff',
        '../outside',  # Should fail
        '/etc/passwd',  # Should fail
    ]
    
    for path in test_paths:
        result = FileUtils.validate_path(path)
        print(f"Path '{path}': {result}")
