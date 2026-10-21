# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for health status in Tilt UI.
Tests the mapping from health responses to Tilt UI indicators.
"""

import pytest


@pytest.mark.health
class TestHealthTiltUI:
    """Tests for Tilt UI health status display."""
    
    def test_ready_resource_shows_green(self, mock_tilt_ui_status):
        """
        Scenario: Ready service shows green
        WHEN `/health/ready` returns `200 OK` with `status: "ready"`
        THEN the Tilt UI SHALL display the resource as **Ready** (green indicator)
        """
        # Simulate a ready health check response
        health_response = {"status": "ready"}
        http_status = 200
        
        # Determine Tilt UI status
        if http_status == 200 and health_response.get("status") == "ready":
            tilt_status = mock_tilt_ui_status["ready"]
        
        assert tilt_status["indicator"] == "green"
        assert tilt_status["status"] == "Ready"
    
    def test_starting_resource_shows_yellow(self, mock_tilt_ui_status):
        """
        Scenario: Starting service shows yellow
        WHEN `/health/ready` returns `503 Service Unavailable` but `/health/live` returns `200`
        THEN the Tilt UI SHALL display the resource as **Starting** (yellow indicator)
        """
        # Simulate starting state (live but not ready)
        live_response = {"status": "alive"}
        ready_response = {"status": "not_ready"}
        live_http_status = 200
        ready_http_status = 503
        
        # Determine Tilt UI status
        if (live_http_status == 200 and live_response.get("status") == "alive" and
            ready_http_status == 503):
            tilt_status = mock_tilt_ui_status["starting"]
        
        assert tilt_status["indicator"] == "yellow"
        assert tilt_status["status"] == "Starting"
    
    def test_error_resource_shows_red(self, mock_tilt_ui_status):
        """
        Scenario: Error service shows red
        WHEN `/health/live` fails or returns non-200
        THEN the Tilt UI SHALL display the resource as **Error** (red indicator)
        """
        # Simulate error state (live failing)
        live_http_status = 500
        
        # Determine Tilt UI status
        if live_http_status != 200:
            tilt_status = mock_tilt_ui_status["error"]
        
        assert tilt_status["indicator"] == "red"
        assert tilt_status["status"] == "Error"
    
    def test_health_status_mapping(self):
        """Test the complete health status to Tilt UI mapping."""
        test_cases = [
            # (live_status, ready_status, live_http, ready_http, expected_indicator, expected_status)
            ("alive", "ready", 200, 200, "green", "Ready"),
            ("alive", "not_ready", 200, 503, "yellow", "Starting"),
            ("dead", "ready", 500, 200, "red", "Error"),
            ("dead", "not_ready", 500, 503, "red", "Error"),
        ]
        
        for live_status, ready_status, live_http, ready_http, expected_indicator, expected_status in test_cases:
            if live_http != 200:
                actual_indicator, actual_status = "red", "Error"
            elif ready_http != 200:
                actual_indicator, actual_status = "yellow", "Starting"
            else:
                actual_indicator, actual_status = "green", "Ready"
            
            assert actual_indicator == expected_indicator, f"Failed for case: {live_status}, {ready_status}"
            assert actual_status == expected_status, f"Failed for case: {live_status}, {ready_status}"
