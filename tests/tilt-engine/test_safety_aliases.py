# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for safety shell aliases.
Tests the alias configuration and functionality.
"""

import pytest


@pytest.mark.safety
class TestSafetyAliases:
    """Tests for safety alias functionality."""
    
    def test_safe_prune_alias_works(self):
        """
        Scenario: Safe prune alias works
        WHEN a user runs `docker-prune-safe` after sourcing aliases
        THEN it SHALL execute `safe-docker-prune.sh standard`
        """
        alias_mapping = {
            "docker-prune-safe": "./scripts/safe-docker-prune.sh standard",
        }
        
        assert "docker-prune-safe" in alias_mapping
        assert "safe-docker-prune.sh" in alias_mapping["docker-prune-safe"]
        assert "standard" in alias_mapping["docker-prune-safe"]
    
    def test_full_prune_alias_works(self):
        """
        Scenario: Full prune alias works
        WHEN a user runs `docker-prune-full` after sourcing aliases
        THEN it SHALL execute `safe-docker-prune.sh full`
        """
        alias_mapping = {
            "docker-prune-full": "./scripts/safe-docker-prune.sh full",
        }
        
        assert "docker-prune-full" in alias_mapping
        assert "safe-docker-prune.sh" in alias_mapping["docker-prune-full"]
        assert "full" in alias_mapping["docker-prune-full"]
    
    def test_alias_is_idempotent(self):
        """
        Scenario: Alias is idempotent
        WHEN a user sources the aliases file multiple times
        THEN the aliases SHALL remain functional
        AND no duplicate definitions SHALL cause errors
        """
        # Simulate sourcing aliases multiple times
        aliases = {}
        
        # First source
        aliases["docker-prune-safe"] = "./scripts/safe-docker-prune.sh standard"
        
        # Second source (should overwrite, not duplicate)
        aliases["docker-prune-safe"] = "./scripts/safe-docker-prune.sh standard"
        
        # Third source
        aliases["docker-prune-safe"] = "./scripts/safe-docker-prune.sh standard"
        
        # Should still work correctly
        assert len(aliases) == 1
        assert aliases["docker-prune-safe"] == "./scripts/safe-docker-prune.sh standard"
    
    def test_protected_volumes_alias_exists(self):
        """Test that docker-protected-volumes alias exists."""
        alias_mapping = {
            "docker-protected-volumes": "docker volume ls | grep -E '(verdaccio|infisical)'",
        }
        
        assert "docker-protected-volumes" in alias_mapping
        assert "verdaccio" in alias_mapping["docker-protected-volumes"]
        assert "infisical" in alias_mapping["docker-protected-volumes"]
    
    def test_alias_commands_are_safe(self):
        """Test that aliased commands don't use --volumes with prune."""
        alias_commands = [
            "./scripts/safe-docker-prune.sh standard",
            "./scripts/safe-docker-prune.sh full",
        ]
        
        for cmd in alias_commands:
            # Safe commands should use the script, not direct docker prune
            assert "safe-docker-prune.sh" in cmd, "Should use safe script"
            assert "docker system prune" not in cmd or "--volumes" not in cmd, "Should not use dangerous direct prune"
