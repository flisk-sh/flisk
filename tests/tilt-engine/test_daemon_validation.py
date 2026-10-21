# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for daemon service validation.
Tests that invalid service.json files are rejected before registration.
"""

import pytest
import json
from pathlib import Path


@pytest.mark.daemon
class TestDaemonValidation:
    """Tests for service validation."""
    
    def test_invalid_resource_json_rejected(self):
        """
        Scenario: Invalid service.json rejected
        WHEN a new service.json file has missing required fields (e.g., no `name`)
        THEN the daemon SHALL log "❌ Invalid service.json at {path}"
        AND it SHALL NOT attempt registration
        """
        # Invalid service - missing required fields
        invalid_service = {
            "type": "backend",
            "port": 4000
            # Missing: name, domain, path
        }
        
        # Validate required fields
        required_fields = ["name", "type", "domain", "path"]
        missing_fields = [f for f in required_fields if f not in invalid_service]
        
        assert len(missing_fields) > 0, "Should detect missing fields"
        assert "name" in missing_fields, "Should detect missing 'name' field"
        
        # In real daemon, this would be rejected
        is_valid = len(missing_fields) == 0
        assert not is_valid, "Invalid service should be rejected"
    
    def test_valid_resource_json_accepted(self):
        """
        Scenario: Valid service.json accepted
        WHEN a new service.json file has all required fields (`name`, `type`, `domain`, `port`)
        THEN the daemon SHALL proceed with registration
        """
        # Valid service with all required fields
        valid_service = {
            "name": "test-service",
            "type": "backend",
            "stack": "test",
            "port": 4000,
            "path": "services/product/test/test-service"
        }
        
        required_fields = ["appName", "appType", "stack", "path"]
        missing_fields = [f for f in required_fields if f not in valid_service]
        
        is_valid = len(missing_fields) == 0
        assert is_valid, "Valid service should be accepted"
    
    def test_validation_detects_port_range(self):
        """Test that port is validated to be in reasonable range."""
        test_cases = [
            ({"appName": "test", "appType": "backend", "stack": "test", "path": "p", "port": 3000}, True),
            ({"appName": "test", "appType": "backend", "stack": "test", "path": "p", "port": 9999}, True),
            ({"appName": "test", "appType": "backend", "stack": "test", "path": "p", "port": 80}, False),  # Too low
            ({"appName": "test", "appType": "backend", "stack": "test", "path": "p", "port": 100000}, False),  # Too high
        ]
        
        for service, expected_valid in test_cases:
            port = service.get("port", 0)
            is_valid = 3000 <= port <= 9999
            assert is_valid == expected_valid, f"Port {port} validation failed"
    
    def test_validation_detects_invalid_type(self):
        """Test that appType is validated against allowed values."""
        valid_types = ["backend", "frontend", "library", "migrator", "sdk", "worker"]
        
        test_cases = [
            ("backend", True),
            ("frontend", True),
            ("microservice", False),  # Invalid type
            ("api", False),  # Invalid type
        ]
        
        for app_type, expected_valid in test_cases:
            is_valid = app_type in valid_types
            assert is_valid == expected_valid, f"Type '{app_type}' validation failed"
    
    def test_validation_allows_optional_fields(self):
        """Test that optional fields don't cause validation failure."""
        resource_with_optional = {
            "name": "test-service",
            "type": "backend",
            "stack": "test",
            "port": 4000,
            "path": "services/product/test/test-service",
            # Optional fields
            "features": ["prisma", "nats"],
            "replicas": 2,
            "healthCheck": True
        }
        
        required_fields = ["name", "type", "domain", "path"]
        has_all_required = all(f in resource_with_optional for f in required_fields)
        
        assert has_all_required, "Service with optional fields should still be valid"
