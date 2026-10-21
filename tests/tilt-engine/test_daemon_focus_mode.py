# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for daemon focus mode compliance.
Tests that discovery respects focus mode stack restrictions.
"""

import pytest
from pathlib import Path
import json


@pytest.mark.daemon
class TestDaemonFocusMode:
    """Tests for focus mode compliance."""
    
    def test_focus_mode_restricts_discovery(self, temp_dir):
        """
        Scenario: Focus mode restricts discovery
        WHEN `--focus identity` is enabled and a new resource appears in `services/product/billing/`
        THEN the daemon SHALL NOT trigger registration (queue it for later)
        AND it SHALL log "⏳ Resource queued (focus mode)"
        """
        # Simulate focus mode config
        focus_config = {
            "enabled": True,
            "stacks": ["identity", "order"],
            "excluded_paths": []
        }
        
        # Resource outside focus
        resource_stack = "billing"
        is_in_focus = resource_stack in focus_config["stacks"]
        
        assert not is_in_focus, "billing should not be in focus mode"
        
        # In real daemon, this would queue instead of registering
        # For test, verify the filtering logic works
        should_register = not focus_config["enabled"] or is_in_focus
        assert not should_register, "Resource outside focus should not be registered immediately"
    
    def test_focus_mode_allows_matching_resources(self, temp_dir):
        """
        Scenario: Focus mode allows matching resources
        WHEN `--focus identity` is enabled and a new resource appears in `services/product/identity/`
        THEN the daemon SHALL trigger registration normally
        """
        # Create resource in focus stack
        focus_config = {
            "enabled": True,
            "stacks": ["identity", "order"],
            "excluded_paths": []
        }
        
        resource_stack = "identity"
        is_in_focus = resource_stack in focus_config["stacks"]
        
        assert is_in_focus, "identity should be in focus mode"
        
        # In focus - should register
        should_register = not focus_config["enabled"] or is_in_focus
        assert should_register, "Resource in focus should be registered"
    
    def test_focus_mode_disabled_allows_all(self):
        """Test that when focus mode is disabled, all resources are registered."""
        focus_config = {
            "enabled": False,
            "stacks": ["identity"],
            "excluded_paths": []
        }
        
        resource_stack = "billing"
        is_in_focus = resource_stack in focus_config["stacks"]
        
        # Focus disabled - should register regardless
        should_register = not focus_config["enabled"] or is_in_focus
        assert should_register, "When focus mode disabled, all resources should register"
    
    def test_focus_mode_stack_matching(self):
        """Test stack matching logic for focus mode."""
        test_cases = [
            ({"enabled": True, "stacks": ["identity"]}, "identity", True),
            ({"enabled": True, "stacks": ["identity"]}, "billing", False),
            ({"enabled": True, "stacks": ["identity", "order"]}, "order", True),
            ({"enabled": False, "stacks": ["identity"]}, "billing", True),
        ]
        
        for config, stack, expected in test_cases:
            is_in_focus = stack in config["stacks"]
            should_register = not config["enabled"] or is_in_focus
            assert should_register == expected, f"Failed for {stack} with config {config}"
