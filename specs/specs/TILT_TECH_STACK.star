#!/usr/bin/env starlark
# -*- coding: utf-8 -*-
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🏗️ TILT TECH STACK MASTER CONFIG
# =============================================================================
# 
# Defines the approved technology choices for the Flisk Landscape platform.
# This is the single source of truth for tech stack validation.
#
# See: docs/TILT_MASTER_CONFIGS.md
# =============================================================================

def get_tech_stack():
    """Returns the complete tech stack definition."""
    return {
        # Core runtime and build tools
        "bundler": "vite",
        "runtime": "bun",
        "language": "typescript",
        
        # Database and ORM
        "orm": "prisma",
        
        # Messaging and events
        "messaging": "nats",
        
        # Development tools
        "linting": "biome",
        "testing": "vitest",
        
        # Web framework
        "web_framework": "hono",
    }

# Constants for direct import
BUNDLER = "vite"
RUNTIME = "bun"
ORM = "prisma"
MESSAGING = "nats"
LINTING = "biome"
TESTING = "vitest"
WEB_FRAMEWORK = "hono"
LANGUAGE = "typescript"

TECH_STACK = get_tech_stack()

def validate_tech_stack(config, strict=False):
    """
    Validates a configuration against the platform tech stack.
    
    Args:
        config: Dict with tech stack choices to validate
        strict: If True, fails on any non-compliance. If False, warns.
    
    Returns:
        Dict with validation results: {"valid": bool, "errors": [], "warnings": []}
    """
    errors = []
    warnings = []
    
    # Check for override reason
    has_override = "_override_reason" in config and config["_override_reason"]
    
    # Strict validations (must match platform standard)
    strict_validations = {
        "bundler": "vite",
        "runtime": "bun",
        "orm": "prisma",
        "messaging": "nats",
    }
    
    for key, standard in strict_validations.items():
        if key in config:
            value = config[key]
            if value.lower() != standard.lower():
                if has_override:
                    warnings.append("Override active: {}='{}' (Reason: {})".format(
                        key, value, config["_override_reason"]
                    ))
                elif strict:
                    errors.append(
                        "❌ Tech Stack Error: {}: '{}' is not supported. " +
                        "Platform standard is '{}'. Use _override_reason to document exceptions.".format(
                            key, value, standard
                        )
                    )
                else:
                    warnings.append(
                        "⚠️ Tech Stack Warning: {}: '{}' is not standard. " +
                        "Platform standard is '{}'.".format(key, value, standard)
                    )
    
    # Optional validations (warnings if missing or different)
    optional_validations = {
        "linting": "biome",
        "testing": "vitest",
    }
    
    for key, standard in optional_validations.items():
        if key in config:
            value = config[key]
            if value.lower() != standard.lower():
                if has_override:
                    warnings.append("Override active: {}='{}' (Reason: {})".format(
                        key, value, config["_override_reason"]
                    ))
                else:
                    warnings.append(
                        "⚠️ Tech Stack Warning: {}: '{}' differs from standard '{}'.".format(
                            key, value, standard
                        )
                    )
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }

def assert_tech_stack(config, strict=False):
    """
    Validates tech stack and fails fast on errors.
    
    Args:
        config: Dict with tech stack choices to validate
        strict: If True, fails on any non-compliance
    
    Raises:
        Exception: If validation fails with errors
    """
    result = validate_tech_stack(config, strict)
    
    # Print warnings
    for warning in result["warnings"]:
        print(warning)
    
    # Fail on errors
    if not result["valid"]:
        for error in result["errors"]:
            print(error)
        fail("Tech stack validation failed. See errors above.")
    
    return result

# Export public API
__all__ = [
    "get_tech_stack",
    "validate_tech_stack",
    "assert_tech_stack",
    "BUNDLER",
    "RUNTIME",
    "ORM",
    "MESSAGING",
    "LINTING",
    "TESTING",
    "WEB_FRAMEWORK",
    "LANGUAGE",
    "TECH_STACK",
]
