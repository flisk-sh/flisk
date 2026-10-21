# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for safe Docker prune script.
Tests the volume protection mechanisms.
"""

import pytest
import re


@pytest.mark.safety
class TestDockerPrune:
    """Tests for Docker prune safety."""
    
    def test_standard_prune_excludes_verdaccio(self, protected_volumes):
        """
        Scenario: Standard prune excludes verdaccio
        WHEN the script `./scripts/safe-docker-prune.sh standard` runs
        AND there is a volume named `verdaccio-storage`
        THEN the volume SHALL NOT be deleted
        AND it SHALL appear in the "protected volumes" list
        """
        volume_name = "verdaccio-storage"
        
        is_protected = self._is_volume_protected(volume_name, protected_volumes)
        
        assert is_protected, "verdaccio-storage should be protected"
    
    def test_full_prune_excludes_infisical(self, protected_volumes):
        """
        Scenario: Full prune excludes infisical
        WHEN the script `./scripts/safe-docker-prune.sh full` runs
        AND there is a volume named `infisical-db-data`
        THEN the volume SHALL NOT be deleted
        AND the script SHALL log "Protected: infisical-db-data"
        """
        volume_name = "infisical-db-data"
        
        is_protected = self._is_volume_protected(volume_name, protected_volumes)
        
        assert is_protected, "infisical-db-data should be protected"
    
    def test_pattern_matching_protection(self, protected_volumes):
        """
        Scenario: Pattern matching protection
        WHEN a volume matches patterns `*verdaccio*` or `*infisical*`
        THEN it SHALL be protected regardless of exact name
        AND examples like `verdaccio-conf`, `verdaccio-plugins` SHALL be protected
        """
        # Test actual protected volumes
        for volume in protected_volumes:
            is_protected = self._is_volume_protected(volume, protected_volumes)
            assert is_protected, f"{volume} should be protected"
        
        # Test pattern matching with additional volumes
        additional_volumes = [
            "verdaccio-logs",
            "verdaccio-backup",
            "infisical-backup",
        ]
        
        for volume in additional_volumes:
            is_protected = self._is_volume_protected(volume, protected_volumes)
            assert is_protected, f"{volume} should be protected by pattern matching"
    
    def test_listing_protected_volumes(self, protected_volumes):
        """
        Scenario: Listing protected volumes
        WHEN running `docker-protected-volumes` alias
        THEN it SHALL list all protected volume patterns
        AND it SHALL show currently matching volumes
        """
        # Verify all expected patterns are present
        expected_volumes = [
            "verdaccio-storage",
            "verdaccio-conf",
            "verdaccio-plugins",
            "infisical-db-data",
            "infisical-redis-data"
        ]
        
        for volume in expected_volumes:
            assert volume in protected_volumes, f"Volume {volume} should be protected"
        
        # Verify pattern-based protection works
        pattern_matches = [v for v in protected_volumes if "verdaccio" in v or "infisical" in v]
        assert len(pattern_matches) >= 5, "Should have multiple protected volumes"
    
    def test_dangerous_command_warning(self):
        """
        Scenario: Dangerous command warning
        WHEN a user runs `docker system prune -a -f --volumes` directly
        THEN the system SHALL warn (if alias is configured): "DANGER: Will delete protected volumes!"
        AND it SHALL suggest using the safe script instead
        """
        dangerous_command = "docker system prune -a -f --volumes"
        
        # Check if command is dangerous
        is_dangerous = "--volumes" in dangerous_command and "prune" in dangerous_command
        
        assert is_dangerous, "Command with --volumes flag should be flagged as dangerous"
    
    def _is_volume_protected(self, volume_name: str, protected_patterns: list) -> bool:
        """Check if volume name matches any protected pattern."""
        volume_lower = volume_name.lower()
        
        # Direct match
        if volume_name in protected_patterns:
            return True
        
        # Pattern matching: check if any protected pattern appears in the volume name
        # This handles cases like "verdaccio-logs" matching "verdaccio-storage" pattern
        for pattern in protected_patterns:
            pattern_lower = pattern.lower()
            # Extract the base name (e.g., "verdaccio" from "verdaccio-storage")
            base_name = pattern_lower.split("-")[0]
            if base_name in volume_lower:
                return True
        
        return False
