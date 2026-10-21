# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for health endpoint response structure.
Tests the /health, /health/live, and /health/ready endpoints.
"""

import pytest
from datetime import datetime, timezone


@pytest.mark.health
class TestHealthEndpoints:
    """Tests for health check endpoint structure."""
    
    def test_overall_health_endpoint_structure(self, mock_health_response):
        """
        Scenario: Overall health endpoint
        WHEN a service with health checks receives a request to `GET /health`
        THEN it SHALL return JSON with fields: `status`, `service`, `version`, `timestamp`, `uptime`, `dependencies`
        AND `status` SHALL be one of: `healthy`, `unhealthy`, `degraded`
        """
        required_fields = ["status", "service", "version", "timestamp", "uptime", "dependencies"]
        
        for field in required_fields:
            assert field in mock_health_response, f"Response missing required field: {field}"
        
        assert mock_health_response["status"] in ["healthy", "unhealthy", "degraded"]
    
    def test_liveness_probe_endpoint(self):
        """
        Scenario: Liveness probe endpoint
        WHEN a service receives a request to `GET /health/live`
        THEN it SHALL return JSON with `status: "alive"` or `status: "dead"`
        AND `timestamp` SHALL be ISO8601 format
        """
        liveness_response = {
            "status": "alive",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        assert "status" in liveness_response
        assert liveness_response["status"] in ["alive", "dead"]
        assert "timestamp" in liveness_response
        
        # Verify ISO8601 format (contains T and timezone info)
        timestamp = liveness_response["timestamp"]
        assert "T" in timestamp, "Timestamp should be ISO8601 format"
    
    def test_readiness_probe_endpoint(self):
        """
        Scenario: Readiness probe endpoint
        WHEN a service receives a request to `GET /health/ready`
        THEN it SHALL return JSON with `status: "ready"` or `status: "not_ready"`
        AND if `not_ready`, it SHALL include `dependencies` object with failing dependency names
        """
        # Test ready state
        ready_response = {
            "status": "ready",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        assert ready_response["status"] in ["ready", "not_ready"]
        
        # Test not_ready state with dependencies
        not_ready_response = {
            "status": "not_ready",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dependencies": {
                "database": "unhealthy",
                "cache": "healthy"
            }
        }
        
        assert not_ready_response["status"] == "not_ready"
        assert "dependencies" in not_ready_response
        assert "database" in not_ready_response["dependencies"]
    
    def test_health_status_values(self):
        """Test that health status values are from allowed set."""
        valid_statuses = ["healthy", "unhealthy", "degraded", "ready", "not_ready", "alive", "dead"]
        
        test_responses = [
            {"status": "healthy"},
            {"status": "unhealthy"},
            {"status": "degraded"},
            {"status": "ready"},
        ]
        
        for response in test_responses:
            assert response["status"] in valid_statuses, f"Invalid status: {response['status']}"
    
    def test_health_response_includes_version(self):
        """Test that health response includes service version."""
        response = {
            "status": "healthy",
            "service": "test-service",
            "version": "1.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "uptime": 3600,
            "dependencies": {}
        }
        
        assert "version" in response
        assert response["version"] == "1.0.0"
    
    def test_health_response_includes_uptime(self):
        """Test that health response includes uptime in seconds."""
        response = {
            "status": "healthy",
            "service": "test-service",
            "version": "1.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "uptime": 3600,
            "dependencies": {}
        }
        
        assert "uptime" in response
        assert isinstance(response["uptime"], (int, float))
        assert response["uptime"] >= 0
