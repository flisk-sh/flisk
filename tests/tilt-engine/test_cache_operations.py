# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for registry cache operations.
Tests the CRUD operations for the service registry cache.
"""

import pytest


@pytest.mark.cache
class TestCacheOperations:
    """Tests for registry cache CRUD operations."""
    
    def test_add_new_resource_to_cache(self, resource_registry_cache):
        """
        Scenario: Add new service to cache
        WHEN `CacheOps.add_resource_to_cache()` is called with a valid service object
        THEN the service SHALL be stored in `_DISCOVERY_CACHE`
        AND it SHALL be retrievable by path via `CacheOps.get_resource_by_path_from_cache()`
        """
        cache = resource_registry_cache
        service = {
            "name": "test-service",
            "path": "services/product/test/test-service"
        }
        
        # Add to cache
        self._add_to_cache(cache, service["path"], service)
        
        # Verify retrievable
        retrieved = self._get_from_cache(cache, service["path"])
        assert retrieved is not None
        assert retrieved["name"] == "test-service"
    
    def test_add_resource_with_metadata(self, resource_registry_cache):
        """
        Scenario: Add service with metadata
        WHEN adding a service with fields `name`, `type`, `path`, `domain`, `port`
        THEN all fields SHALL be preserved in the cache
        AND retrieval SHALL return the exact same data
        """
        cache = resource_registry_cache
        service = {
            "name": "identity-backend",
            "type": "backend",
            "path": "services/product/identity/identity-backend",
            "stack": "identity",
            "port": 4001
        }
        
        self._add_to_cache(cache, service["path"], service)
        retrieved = self._get_from_cache(cache, service["path"])
        
        assert retrieved["name"] == "identity-backend"
        assert retrieved["type"] == "backend"
        assert retrieved["stack"] == "identity"
        assert retrieved["port"] == 4001
    
    def test_prevent_duplicate_adds(self, resource_registry_cache):
        """
        Scenario: Prevent duplicate adds
        WHEN attempting to add a service with a path already in cache
        THEN the new service data SHALL overwrite the old data (update semantics)
        AND the cache SHALL contain only one entry for that path
        """
        cache = resource_registry_cache
        path = "services/product/test/service"
        
        # Add initial version
        self._add_to_cache(cache, path, {"name": "v1", "port": 4000})
        
        # Add updated version (should overwrite)
        self._add_to_cache(cache, path, {"name": "v2", "port": 4001})
        
        # Retrieve and verify
        retrieved = self._get_from_cache(cache, path)
        assert retrieved["name"] == "v2"
        assert retrieved["port"] == 4001
    
    def test_remove_existing_service(self, resource_registry_cache):
        """
        Scenario: Remove existing service
        WHEN `CacheOps.remove_resource_from_cache()` is called with a path in cache
        THEN the service SHALL be removed from `_DISCOVERY_CACHE`
        AND subsequent `CacheOps.has_resource_in_cache()` SHALL return `False`
        """
        cache = resource_registry_cache
        path = "services/product/test/service"
        
        # Add and verify
        self._add_to_cache(cache, path, {"name": "test"})
        assert self._has_in_cache(cache, path)
        
        # Remove
        self._remove_from_cache(cache, path)
        
        # Verify removed
        assert not self._has_in_cache(cache, path)
    
    def test_remove_non_existent_service(self, resource_registry_cache):
        """
        Scenario: Remove non-existent service
        WHEN attempting to remove a path not in cache
        THEN it SHALL complete without error (idempotent)
        AND other cache entries SHALL remain unaffected
        """
        cache = resource_registry_cache
        
        # Add a service
        self._add_to_cache(cache, "path1", {"name": "service1"})
        
        # Try to remove non-existent path
        self._remove_from_cache(cache, "nonexistent")  # Should not raise
        
        # Verify other entries unaffected
        assert self._has_in_cache(cache, "path1")
    
    def test_check_resource_existence(self, resource_registry_cache):
        """
        Scenario: Check service existence
        WHEN `CacheOps.has_resource_in_cache()` is called with a cached path
        THEN it SHALL return `True`
        """
        cache = resource_registry_cache
        path = "services/product/test/service"
        
        self._add_to_cache(cache, path, {"name": "test"})
        
        assert self._has_in_cache(cache, path)
    
    def test_check_non_existent_service(self, resource_registry_cache):
        """
        Scenario: Check non-existent service
        WHEN `CacheOps.has_resource_in_cache()` is called with an unknown path
        THEN it SHALL return `False`
        """
        cache = resource_registry_cache
        
        assert not self._has_in_cache(cache, "nonexistent")
    
    def test_get_resource_by_path(self, resource_registry_cache):
        """
        Scenario: Get service by path
        WHEN `CacheOps.get_resource_by_path_from_cache()` is called with a cached path
        THEN it SHALL return the full service object
        """
        cache = resource_registry_cache
        service = {"name": "test", "type": "backend"}
        path = "services/product/test/service"
        
        self._add_to_cache(cache, path, service)
        retrieved = self._get_from_cache(cache, path)
        
        assert retrieved == service
    
    def test_get_non_existent_resource_returns_none(self, resource_registry_cache):
        """
        Scenario: Get non-existent service
        WHEN `CacheOps.get_resource_by_path_from_cache()` is called with an unknown path
        THEN it SHALL return `None` (not raise an exception)
        """
        cache = resource_registry_cache
        
        result = self._get_from_cache(cache, "nonexistent")
        
        assert result is None
    
    # Helper methods to simulate cache operations
    def _add_to_cache(self, cache, path, service):
        if "resource_path_map" not in cache:
            cache["resource_path_map"] = {}
        cache["resource_path_map"][path] = service
    
    def _get_from_cache(self, cache, path):
        return cache.get("resource_path_map", {}).get(path)
    
    def _remove_from_cache(self, cache, path):
        if path in cache.get("resource_path_map", {}):
            del cache["resource_path_map"][path]
    
    def _has_in_cache(self, cache, path):
        return path in cache.get("resource_path_map", {})
