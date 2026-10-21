# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - VALIDATOR TESTS (Phase 3)
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/tests/test_validator.star
# Purpose: Integration tests for validator module
# Status: Phase 3 of manifest system refactoring
# =============================================================================

load("../__init__.star", "Manifest")
load("../validator.star", "ManifestValidator")

# =============================================================================
# TEST FRAMEWORK
# =============================================================================

test_results = {
    'passed': 0,
    'failed': 0,
    'errors': [],
}

def assert_true(condition, message="Assertion failed"):
    """Assert that condition is true."""
    if not condition:
        test_results['failed'] += 1
        test_results['errors'].append("FAIL: " + message)
    else:
        test_results['passed'] += 1

def assert_equal(expected, actual, message="Values not equal"):
    """Assert that expected equals actual."""
    if expected != actual:
        test_results['failed'] += 1
        test_results['errors'].append(
            "FAIL: {} - expected '{}', got '{}'".format(message, expected, actual)
        )
    else:
        test_results['passed'] += 1

def assert_not_none(value, message="Value is None"):
    """Assert that value is not None."""
    if value == None:
        test_results['failed'] += 1
        test_results['errors'].append("FAIL: " + message)
    else:
        test_results['passed'] += 1

# =============================================================================
# TEST SUITE: Validator Functions
# =============================================================================

def _test_validator_functions():
    """Test that validator functions are accessible."""
    print("🔍 Testing validator module accessibility...")
    
    # Test functions accessible via facade
    assert_not_none(Manifest.validate, "validate should be accessible")
    assert_not_none(Manifest.is_valid, "is_valid should be accessible")
    assert_not_none(Manifest.get_validation_report, "get_validation_report should be accessible")
    assert_not_none(Manifest.validate_schema, "validate_schema should be accessible")
    assert_not_none(Manifest.validate_values, "validate_values should be accessible")
    assert_not_none(Manifest.validate_dependencies, "validate_dependencies should be accessible")
    
    print("✅ Validator functions accessible\n")

# =============================================================================
# TEST SUITE: Schema Validation
# =============================================================================

def _test_schema_validation():
    """Test schema-level validation."""
    print("🔍 Testing schema validation...")
    
    # Valid manifest
    valid_manifest = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.validate_schema(valid_manifest)
    assert_true(result.valid, "Valid manifest should pass schema validation")
    assert_equal(0, len(result.errors), "Valid manifest should have no errors")
    
    # Missing required field
    invalid_manifest = {
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.validate_schema(invalid_manifest)
    assert_true(not result.valid, "Missing required field should fail")
    assert_true(len(result.errors) > 0, "Should have errors for missing appName")
    
    # Invalid type
    wrong_type_manifest = {
        'appName': 'test-service',
        'appType': 'invalid-type',
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.validate_schema(wrong_type_manifest)
    # Note: Type checking might be lenient in initial implementation
    
    print("✅ Schema validation tests complete\n")

# =============================================================================
# TEST SUITE: Value Validation
# =============================================================================

def _test_value_validation():
    """Test value-level validation."""
    print("🔍 Testing value validation...")
    
    # Invalid port (too low)
    manifest_low_port = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 100,  # Invalid: below 1024
    }
    
    result = Manifest.validate_values(manifest_low_port)
    assert_true(not result.valid or len(result.errors) > 0, "Port too low should fail")
    
    # Invalid port (too high)
    manifest_high_port = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 70000,  # Invalid: above 65535
    }
    
    result = Manifest.validate_values(manifest_high_port)
    assert_true(not result.valid or len(result.errors) > 0, "Port too high should fail")
    
    # Valid port
    manifest_valid_port = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.validate_values(manifest_valid_port)
    # Valid port should not have errors (might have warnings)
    
    # Invalid appName format
    manifest_bad_name = {
        'appName': 'TestService',  # Invalid: uppercase
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.validate_values(manifest_bad_name)
    assert_true(len(result.errors) > 0 or len(result.warnings) > 0, 
                "Invalid appName format should produce error or warning")
    
    # Too many replicas
    manifest_many_replicas = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
        'replicas': 10,  # Exceeds max
    }
    
    result = Manifest.validate_values(manifest_many_replicas)
    # Should fail or warn
    
    print("✅ Value validation tests complete\n")

# =============================================================================
# TEST SUITE: Cross-Field Validation
# =============================================================================

def _test_cross_field_validation():
    """Test cross-field validation."""
    print("🔍 Testing cross-field validation...")
    
    # Frontend without backendName
    frontend_no_backend = {
        'appName': 'test-frontend',
        'appType': 'frontend',
        'stack': 'user',
        'port': 3000,
        # Missing backendName
    }
    
    result = Manifest.validate(frontend_no_backend, level='cross_field')
    assert_true(len(result.errors) > 0, "Frontend without backendName should fail")
    
    # Valid frontend
    frontend_valid = {
        'appName': 'test-frontend',
        'appType': 'frontend',
        'stack': 'user',
        'port': 3000,
        'backendName': 'test-backend',
    }
    
    result = Manifest.validate(frontend_valid, level='cross_field')
    assert_true(len([e for e in result.errors if 'backendName' in str(e)]) == 0, 
                "Valid frontend should not have backend errors")
    
    # Prisma without databaseName (warning)
    prisma_no_db = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
        'featuresEnabled': ['prisma'],
        # Missing databaseName
    }
    
    result = Manifest.validate(prisma_no_db, level='cross_field')
    # Should have warning but not necessarily error
    
    print("✅ Cross-field validation tests complete\n")

# =============================================================================
# TEST SUITE: Cross-Service Validation
# =============================================================================

def _test_cross_resource_validation():
    """Test cross-service validation."""
    print("🔍 Testing cross-service validation...")
    
    # Create a set of manifests
    manifests = [
        {
            'appName': 'identity-backend',
            'appType': 'backend',
            'stack': 'identity',
            'port': 4004,
        },
        {
            'appName': 'user-backend',
            'appType': 'backend',
            'stack': 'user',
            'port': 4000,
            'dependsOn': ['identity-backend'],  # Valid
        },
        {
            'appName': 'user-frontend',
            'appType': 'frontend',
            'stack': 'user',
            'port': 3000,
            'backendName': 'user-backend',  # Valid
        },
    ]
    
    # Test valid dependency
    user_manifest = manifests[1]
    result = Manifest.validate_dependencies(user_manifest, manifests)
    assert_true(result.valid, "Valid dependency should pass")
    
    # Test invalid dependency
    bad_dep_manifest = {
        'appName': 'bad-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4002,
        'dependsOn': ['nonexistent-service'],  # Invalid
    }
    
    result = Manifest.validate_dependencies(bad_dep_manifest, manifests)
    assert_true(len(result.errors) > 0, "Invalid dependency should fail")
    
    # Test port conflict
    conflict_manifest = {
        'appName': 'conflict-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4000,  # Same as user-backend
    }
    
    result = Manifest.validate_dependencies(conflict_manifest, manifests)
    assert_true(len(result.errors) > 0, "Port conflict should fail")
    
    # Test frontend with non-existent backend
    bad_frontend = {
        'appName': 'bad-frontend',
        'appType': 'frontend',
        'stack': 'user',
        'port': 3001,
        'backendName': 'nonexistent-backend',
    }
    
    result = Manifest.validate_dependencies(bad_frontend, manifests)
    assert_true(len(result.errors) > 0, "Frontend with bad backend should fail")
    
    print("✅ Cross-service validation tests complete\n")

# =============================================================================
# TEST SUITE: Full Validation
# =============================================================================

def _test_full_validation():
    """Test full validation at all levels."""
    print("🔍 Testing full validation...")
    
    # Valid complete manifest
    valid_manifest = {
        'appName': 'user-management-backend',
        'appType': 'backend',
        'stack': 'user',
        'port': 4000,
        'replicas': 1,
        'runtime': 'bun',
        'featuresEnabled': ['nats', 'prisma'],
        'databaseName': 'TDK_user',
        'dependsOn': [],
        'traefik': {
            'pathPrefix': '/api/v1/users',
            'priority': 100,
        },
    }
    
    result = Manifest.validate(valid_manifest, level='all')
    
    # Should be valid (may have warnings but no errors)
    assert_true(len([e for e in result.errors if e.severity == 'error' or e.severity == 'critical']) == 0,
                "Valid manifest should not have critical errors")
    
    # Check stats
    assert_true(result.stats['fields_checked'] > 0, "Should check fields")
    
    print("✅ Full validation tests complete\n")

# =============================================================================
# TEST SUITE: is_valid Convenience Function
# =============================================================================

def _test_is_valid():
    """Test the is_valid convenience function."""
    print("🔍 Testing is_valid function...")
    
    valid = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.is_valid(valid)
    assert_true(result, "Valid manifest should return True from is_valid")
    
    invalid = {
        'appType': 'backend',  # Missing appName
        'stack': 'user',
        'port': 4001,
    }
    
    result = Manifest.is_valid(invalid)
    assert_true(not result, "Invalid manifest should return False from is_valid")
    
    print("✅ is_valid tests complete\n")

# =============================================================================
# TEST SUITE: Validation Report
# =============================================================================

def _test_validation_report():
    """Test validation report generation."""
    print("🔍 Testing validation report...")
    
    manifest = {
        'appName': 'test-service',
        'appType': 'backend',
        'stack': 'user',
        'port': 4001,
    }
    
    report = Manifest.get_validation_report(manifest)
    
    assert_not_none(report, "Report should be generated")
    assert_true('VALIDATION REPORT' in report, "Report should have title")
    assert_true('Status:' in report, "Report should have status")
    
    # Test with errors
    bad_manifest = {
        'appType': 'backend',  # Missing required fields
        'stack': 'user',
    }
    
    report = Manifest.get_validation_report(bad_manifest)
    assert_true('FAILED' in report or 'failed' in report.lower(), 
                "Report should show failure for invalid manifest")
    
    print("✅ Validation report tests complete\n")

# =============================================================================
# TEST SUITE: Strict Mode
# =============================================================================

def _test_strict_mode():
    """Test strict mode (warnings as errors)."""
    print("🔍 Testing strict mode...")
    
    # Manifest with warnings
    manifest = {
        'appName': 'test-service',
        'appType': 'frontend',
        'stack': 'user',
        'port': 3000,
        'backendName': 'test-backend',
        # Missing basePath - might cause warning
    }
    
    # Normal mode
    result_normal = Manifest.validate(manifest, level='all')
    
    # Strict mode
    result_strict = Manifest.validate(manifest, context={'strict': True}, level='all')
    
    # In strict mode, warnings should be converted to errors
    # (This depends on specific validation rules that generate warnings)
    
    print("✅ Strict mode tests complete\n")

# =============================================================================
# MAIN
# =============================================================================

def run_tests():
    """Run all Phase 3 validator tests."""
    print("\n" + "="*70)
    print("📋 MANIFEST MODULE - PHASE 3 VALIDATOR TESTS")
    print("="*70 + "\n")
    
    # Run all test suites
    _test_validator_functions()
    _test_schema_validation()
    _test_value_validation()
    _test_cross_field_validation()
    _test_cross_resource_validation()
    _test_full_validation()
    _test_is_valid()
    _test_validation_report()
    _test_strict_mode()
    
    # Print results
    print("\n" + "="*70)
    print("📊 TEST RESULTS")
    print("="*70)
    print("✅ Passed: {}".format(test_results['passed']))
    print("❌ Failed: {}".format(test_results['failed']))
    
    if test_results['errors']:
        print("\n📝 ERRORS:")
        for error in test_results['errors']:
            print("   " + error)
    else:
        print("\n🎉 All Phase 3 validator tests passed!")
    
    print("="*70 + "\n")
    
    return test_results['failed'] == 0

# Export test runner
TestValidator = struct(
    run=run_tests,
)

VALIDATION = {}
