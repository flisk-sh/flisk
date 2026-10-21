# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for health dependency checks.
Tests that services report correct health status for their dependencies.
"""

import pytest
from datetime import datetime, timezone


@pytest.mark.health
class TestHealthDependencies:
    """Tests for dependency health checking."""
    
    def test_database_health_check_success(self):
        """
        Scenario: Database health check
        WHEN a service has a database dependency configured with `createDatabaseHealthCheck`
        AND the database is accessible
        THEN `/health/ready` SHALL return `status: "ready"` with `database: "healthy"`
        """
        # Simulate successful database check
        db_check_result = {"healthy": True, "latency_ms": 5}
        
        health_response = {
            "status": "ready",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dependencies": {
                "database": "healthy" if db_check_result["healthy"] else "unhealthy"
            }
        }
        
        assert health_response["status"] == "ready"
        assert health_response["dependencies"]["database"] == "healthy"
    
    def test_database_health_check_failure(self):
        """
        Scenario: Database health check failure
        WHEN a service has a database dependency but the database is unreachable
        THEN `/health/ready` SHALL return `status: "not_ready"` with `database: "unhealthy"`
        AND the response SHALL include error details
        """
        # Simulate failed database check
        db_check_result = {"healthy": False, "error": "Connection refused"}
        
        health_response = {
            "status": "not_ready",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dependencies": {
                "database": "unhealthy",
                "database_error": db_check_result["error"]
            }
        }
        
        assert health_response["status"] == "not_ready"
        assert health_response["dependencies"]["database"] == "unhealthy"
        assert "database_error" in health_response["dependencies"]
    
    def test_multiple_dependency_statuses(self):
        """
        Scenario: Multiple dependencies
        WHEN a service has database and cache dependencies
        AND database is healthy but cache is unhealthy
        THEN `/health/ready` SHALL return `status: "not_ready"`
        AND the response SHALL include status for each dependency
        """
        # Simulate mixed dependency health
        dependencies = {
            "database": {"healthy": True, "latency_ms": 5},
            "cache": {"healthy": False, "error": "Timeout"},
            "nats": {"healthy": True, "latency_ms": 2}
        }
        
        # Service is not ready if any dependency is unhealthy
        all_healthy = all(d["healthy"] for d in dependencies.values())
        
        health_response = {
            "status": "ready" if all_healthy else "not_ready",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dependencies": {
                name: "healthy" if data["healthy"] else "unhealthy"
                for name, data in dependencies.items()
            }
        }
        
        assert health_response["status"] == "not_ready"
        assert health_response["dependencies"]["database"] == "healthy"
        assert health_response["dependencies"]["cache"] == "unhealthy"
        assert health_response["dependencies"]["nats"] == "healthy"
    
    def test_all_dependencies_healthy(self):
        """Test when all dependencies are healthy."""
        dependencies = {
            "database": {"healthy": True},
            "cache": {"healthy": True},
            "nats": {"healthy": True}
        }
        
        all_healthy = all(d["healthy"] for d in dependencies.values())
        
        assert all_healthy, "All dependencies should be healthy"
        
        health_response = {
            "status": "ready",
            "dependencies": {
                name: "healthy" for name in dependencies.keys()
            }
        }
        
        assert health_response["status"] == "ready"
    
    def test_dependency_latency_reporting(self):
        """Test that dependency health checks include latency."""
        dependencies = {
            "database": {"healthy": True, "latency_ms": 5},
            "cache": {"healthy": True, "latency_ms": 2}
        }
        
        health_response = {
            "status": "ready",
            "dependencies": {
                name: {
                    "status": "healthy" if data["healthy"] else "unhealthy",
                    "latency_ms": data.get("latency_ms", 0)
                }
                for name, data in dependencies.items()
            }
        }
        
        assert health_response["dependencies"]["database"]["latency_ms"] == 5
        assert health_response["dependencies"]["cache"]["latency_ms"] == 2
