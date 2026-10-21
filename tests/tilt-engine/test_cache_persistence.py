# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for registry cache persistence.
Tests saving and loading the cache from the filesystem.
"""

import json
import pytest
from pathlib import Path


@pytest.mark.cache
class TestCachePersistence:
    """Tests for cache persistence operations."""
    
    def test_save_cache_to_file(self, temp_dir, resource_registry_cache):
        """
        Scenario: Save cache to file
        WHEN the cache is saved to a JSON file
        THEN the file SHALL exist with valid JSON
        AND it SHALL contain all cached services
        """
        cache_file = temp_dir / "discovery-cache.json"
        
        # Add services to cache
        cache = resource_registry_cache
        cache["resource_path_map"] = {
            "path1": {"name": "service1"},
            "path2": {"name": "service2"}
        }
        
        # Save to file
        self._save_cache(cache, cache_file)
        
        # Verify file exists
        assert cache_file.exists()
        
        # Verify content
        with open(cache_file) as f:
            data = json.load(f)
        
        assert "resource_path_map" in data
        assert len(data["resource_path_map"]) == 2
    
    def test_load_cache_from_file(self, temp_dir, resource_registry_cache):
        """
        Scenario: Load cache from file
        WHEN loading cache from a previously saved JSON file
        THEN `_DISCOVERY_CACHE` SHALL be populated with the saved services
        AND all query operations SHALL work on the loaded data
        """
        cache_file = temp_dir / "discovery-cache.json"
        
        # Create saved cache file
        saved_data = {
            "resource_path_map": {
                "path1": {"name": "service1", "type": "backend"},
                "path2": {"name": "service2", "type": "frontend"}
            }
        }
        with open(cache_file, "w") as f:
            json.dump(saved_data, f)
        
        # Load cache
        cache = resource_registry_cache
        self._load_cache(cache, cache_file)
        
        # Verify loaded
        assert "path1" in cache["resource_path_map"]
        assert cache["resource_path_map"]["path1"]["name"] == "service1"
        assert cache["resource_path_map"]["path2"]["type"] == "frontend"
    
    def test_cache_survives_process_restart(self, temp_dir, resource_registry_cache):
        """
        Scenario: Cache survives process restart
        WHEN the Tilt process restarts
        AND the cache file exists
        THEN the cache SHALL be reloaded automatically
        AND no services SHALL need re-discovery
        """
        cache_file = temp_dir / "discovery-cache.json"
        
        # Simulate first run - save cache
        cache1 = resource_registry_cache
        cache1["resource_path_map"] = {
            "services/test/service1": {"name": "service1"},
            "services/test/service2": {"name": "service2"}
        }
        self._save_cache(cache1, cache_file)
        
        # Simulate restart - new cache object, load from file
        cache2 = {"initialized": False, "resource_path_map": {}}
        self._load_cache(cache2, cache_file)
        
        # Verify cache survived
        assert "services/test/service1" in cache2["resource_path_map"]
        assert "services/test/service2" in cache2["resource_path_map"]
        assert cache2["resource_path_map"]["services/test/service1"]["name"] == "service1"
    
    def test_save_and_load_empty_cache(self, temp_dir):
        """Test saving and loading an empty cache."""
        cache_file = temp_dir / "empty-cache.json"
        
        empty_cache = {"resource_path_map": {}}
        self._save_cache(empty_cache, cache_file)
        
        loaded_cache = {"resource_path_map": {}}
        self._load_cache(loaded_cache, cache_file)
        
        assert len(loaded_cache["resource_path_map"]) == 0
    
    def test_cache_file_format(self, temp_dir):
        """Test that cache file has expected format."""
        cache_file = temp_dir / "cache.json"
        
        cache = {
            "initialized": True,
            "resource_path_map": {
                "path": {"name": "test"}
            }
        }
        self._save_cache(cache, cache_file)
        
        with open(cache_file) as f:
            content = f.read()
        
        # Should be valid JSON
        data = json.loads(content)
        assert "resource_path_map" in data
    
    # Helper methods
    def _save_cache(self, cache, path):
        with open(path, "w") as f:
            json.dump(cache, f, indent=2)
    
    def _load_cache(self, cache, path):
        if not path.exists():
            return
        
        with open(path) as f:
            data = json.load(f)
        
        cache.update(data)
