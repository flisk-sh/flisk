#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Automated tests for TemplateEngine
Tests variable substitution, conditional blocks, and loops.
"""

import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))
from template_engine import TemplateEngine


class TestTemplateEngine:
    """Test suite for TemplateEngine"""

    def __init__(self):
        self.passed = 0
        self.failed = 0

    def assert_equals(self, a, b, msg):
        """Assert two values are equal"""
        if a == b:
            self.passed += 1
            print(f"  ✓ {msg}")
        else:
            self.failed += 1
            print(f"  ✗ {msg}: expected {b!r}, got {a!r}")

    def run_all_tests(self):
        """Run all test methods"""
        print("\n" + "="*60)
        print("TemplateEngine Test Suite")
        print("="*60)

        self.test_render()
        self.test_render_conditional_true()
        self.test_render_conditional_false()
        self.test_render_conditional_mixed()
        self.test_render_loop()

        print("\n" + "="*60)
        print(f"Results: {self.passed} passed, {self.failed} failed")
        print("="*60)
        return self.failed == 0

    def test_render(self):
        """Basic variable substitution"""
        print("\n📝 Testing Basic Rendering")
        result = TemplateEngine.render(
            "Hello, {name}! Welcome to {place}.",
            name="World",
            place="Tilt IDE",
        )
        self.assert_equals(
            result,
            "Hello, World! Welcome to Tilt IDE.",
            "Variables are substituted",
        )

    def test_render_conditional_true(self):
        """A true condition keeps the block content and removes the tags"""
        print("\n✅ Testing Conditional (true)")
        result = TemplateEngine.render_conditional(
            "{{if show_greeting}}Hello!{{endif}}",
            {"show_greeting": True},
        )
        self.assert_equals(result, "Hello!", "True condition keeps content")

    def test_render_conditional_false(self):
        """A false condition removes the whole block, tags included"""
        print("\n❌ Testing Conditional (false)")
        result = TemplateEngine.render_conditional(
            "{{if show_name}}{name}{{endif}}",
            {"show_name": False},
        )
        self.assert_equals(result, "", "False condition removes block")

    def test_render_conditional_mixed(self):
        """Mixed conditions keep only the true blocks; text outside
        the blocks and after {{endif}} is preserved"""
        print("\n🔀 Testing Conditional (mixed)")
        template = (
            "A {{if show_greeting}}Hello!{{endif}} "
            "B {{if show_name}}{name}{{endif}} C"
        )
        result = TemplateEngine.render_conditional(
            template,
            {"show_greeting": True, "show_name": False},
        )
        self.assert_equals(
            result,
            "A Hello! B  C",
            "Only true blocks are kept, surrounding text preserved",
        )

    def test_render_loop(self):
        """Loop rendering joins the rendered items"""
        print("\n🔁 Testing Loop Rendering")
        result = TemplateEngine.render_loop(
            "<ul>{items}</ul>",
            [{"name": "File Browser", "value": "Port 9765"}],
            "<li>{name}: {value}</li>",
        )
        self.assert_equals(
            result,
            "<ul><li>File Browser: Port 9765</li></ul>",
            "Loop items are rendered and joined",
        )


def run_tests():
    """Run all tests and return exit code"""
    tester = TestTemplateEngine()
    success = tester.run_all_tests()
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(run_tests())
