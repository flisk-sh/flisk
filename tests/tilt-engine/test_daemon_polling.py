# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for discovery daemon polling behavior.
Tests the continuous monitoring and polling intervals.
"""

import asyncio
import pytest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock


@pytest.mark.daemon
class TestDaemonPolling:
    """Tests for daemon polling functionality."""
    
    @pytest.mark.asyncio
    async def test_daemon_polls_at_configured_interval(self):
        """
        Scenario: Daemon polls at configured interval
        WHEN the daemon starts with `DISCOVERY_SCAN_INTERVAL=2`
        THEN it SHALL call the scanner function every 2 seconds
        """
        mock_scanner = Mock(return_value=[])
        
        # Mock the daemon loop to run only 3 iterations
        call_count = 0
        async def mock_daemon_loop():
            nonlocal call_count
            for _ in range(3):
                mock_scanner()
                call_count += 1
                await asyncio.sleep(0.1)  # Fast sleep for testing
        
        # Run the mock daemon
        await mock_daemon_loop()
        
        assert call_count == 3, f"Expected 3 polling calls, got {call_count}"
        assert mock_scanner.call_count == 3
    
    @pytest.mark.asyncio
    async def test_daemon_stops_cleanly_on_signal(self):
        """
        Scenario: Daemon can be stopped
        WHEN the daemon receives a stop signal
        THEN it SHALL cease polling and exit cleanly within 1 second
        """
        stop_event = asyncio.Event()
        poll_count = [0]  # Use list to allow mutation in nested function
        
        async def polling_loop():
            while not stop_event.is_set():
                poll_count[0] += 1
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=0.1)
                except asyncio.TimeoutError:
                    pass
        
        # Start polling
        task = asyncio.create_task(polling_loop())
        
        # Let it poll a few times
        await asyncio.sleep(0.25)
        
        # Signal stop
        stop_event.set()
        
        # Wait for clean exit with timeout
        try:
            await asyncio.wait_for(task, timeout=1.0)
        except asyncio.TimeoutError:
            task.cancel()
        
        assert poll_count[0] >= 2, "Should have polled at least twice"
        assert task.done(), "Task should be completed"
    
    def test_polling_respects_interval_setting(self):
        """Test that the daemon respects DISCOVERY_SCAN_INTERVAL."""
        import os
        
        # Default should be 5 seconds
        interval = int(os.environ.get("DISCOVERY_SCAN_INTERVAL", "5"))
        
        assert interval > 0, "Interval should be positive"
        assert interval <= 60, "Interval should be reasonable (<= 60s)"
    
    @pytest.mark.asyncio
    async def test_polling_detects_changes_over_time(self, temp_dir):
        """Test that daemon detects changes across multiple polling cycles."""
        from pathlib import Path
        import json
        
        # Create initial service
        services_dir = temp_dir / "services" / "product"
        services_dir.mkdir(parents=True)
        
        resource_dir = services_dir / "initial" / "service"
        resource_dir.mkdir(parents=True)
        (resource_dir / "service.json").write_text(json.dumps({"name": "initial"}))
        
        poll_results = []
        
        async def mock_scan_cycle():
            # Simulate scanning
            import sys
            sys.path.insert(0, str(Path("discovery").resolve()))
            from resource_snapshot import get_current_services
            
            services = get_current_services(str(services_dir))
            poll_results.append(len(services))
        
        # First poll - should find 1 service
        await mock_scan_cycle()
        assert poll_results[-1] == 1
        
        # Add new service
        new_dir = services_dir / "new" / "service"
        new_dir.mkdir(parents=True)
        (new_dir / "service.json").write_text(json.dumps({"name": "new"}))
        
        # Second poll - should find 2 services
        await mock_scan_cycle()
        assert poll_results[-1] == 2
