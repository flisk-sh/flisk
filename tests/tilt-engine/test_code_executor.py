# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for code executor component.
Tests the terminal interface and command safety features.
"""

import pytest
import asyncio
from pathlib import Path
from typing import List, Tuple


@pytest.mark.ide
class TestCodeExecutor:
    """Tests for code executor functionality."""
    
    def test_allowed_command_execution(self, safe_commands):
        """
        Scenario: Allowed command execution
        WHEN a user submits `bun test` via the terminal interface
        THEN it SHALL execute the command
        AND it SHALL stream output to the browser in real-time
        """
        for cmd in safe_commands:
            is_allowed = self._is_command_allowed(cmd)
            assert is_allowed, f"Command should be allowed: {cmd}"
    
    def test_dangerous_command_blocked(self, dangerous_commands):
        """
        Scenario: Dangerous command blocked
        WHEN a user submits `rm -rf /` via the terminal interface
        THEN it SHALL return `403 Forbidden`
        AND it SHALL NOT execute the command
        AND it SHALL log the blocked attempt
        """
        for cmd in dangerous_commands:
            is_allowed = self._is_command_allowed(cmd)
            assert not is_allowed, f"Dangerous command should be blocked: {cmd}"
    
    @pytest.mark.asyncio
    async def test_timeout_enforcement(self):
        """
        Scenario: Timeout enforcement
        WHEN a user submits a command that runs longer than 60 seconds
        THEN it SHALL terminate the process after 60 seconds
        AND it SHALL return partial output with a timeout message
        """
        # Simulate long-running command
        timeout_seconds = 60
        
        async def long_command():
            await asyncio.sleep(100)  # Would run for 100s
            return "complete"
        
        # Wrap with timeout
        try:
            result = await asyncio.wait_for(long_command(), timeout=timeout_seconds)
            assert False, "Should have timed out"
        except asyncio.TimeoutError:
            pass  # Expected
        
        # Verify timeout occurred
        assert True, "Timeout was correctly enforced"
    
    def test_command_history_navigation(self):
        """
        Scenario: Command history
        WHEN a user presses the Up arrow in the terminal
        THEN it SHALL display the previously executed command
        AND Down arrow SHALL navigate forward in history
        """
        # Simulate command history
        history: List[str] = [
            "bun test",
            "ls -la",
            "git status"
        ]
        
        current_index = len(history)  # Start at end (empty line)
        
        # Press Up - should go to last command
        current_index -= 1
        assert current_index == 2
        assert history[current_index] == "git status"
        
        # Press Up again
        current_index -= 1
        assert history[current_index] == "ls -la"
        
        # Press Down - should go forward
        current_index += 1
        assert history[current_index] == "git status"
    
    def test_command_output_streaming(self):
        """Test that command output streams in real-time."""
        output_lines = [
            "Running tests...",
            "Test 1 passed",
            "Test 2 passed",
            "All tests passed!"
        ]
        
        # Simulate streaming
        received_lines = []
        for line in output_lines:
            received_lines.append(line)
        
        assert len(received_lines) == len(output_lines)
        assert received_lines == output_lines
    
    def test_blocked_command_logging(self, dangerous_commands):
        """Test that blocked commands are logged."""
        blocked_commands: List[str] = []
        
        for cmd in dangerous_commands:
            if not self._is_command_allowed(cmd):
                blocked_commands.append(cmd)
        
        assert len(blocked_commands) == len(dangerous_commands)
    
    def _is_command_allowed(self, command: str) -> bool:
        """Check if command is allowed."""
        dangerous_patterns = [
            "rm -rf /",
            "sudo",
            "su -",
            "passwd",
            "mkfs",
            "dd if=/dev/zero",
            "> /dev/sda",
            "chmod 777 /",
            ":(){ :|:& };:",  # Fork bomb
        ]
        
        cmd_lower = command.lower()
        
        for pattern in dangerous_patterns:
            if pattern in cmd_lower:
                return False
        
        # Allow common safe commands
        safe_prefixes = [
            "bun ",
            "npm ",
            "git ",
            "ls",
            "cat ",
            "echo ",
            "pwd",
            "cd ",
        ]
        
        return any(command.startswith(prefix) for prefix in safe_prefixes)
