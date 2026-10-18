# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - UNIT TESTS
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/tests/test_manifest.star
# Purpose: Unit tests for manifest system
# Status: Phase 1 of manifest system refactoring
# 
# Run with: tilt test (when implemented) or manually load and run
# =============================================================================

# Import modules under test
load("../__init__.star", "Manifest")
load("../constants.star", "ManifestConstants")
load("../errors.star", "ManifestErrors")
load("../schema.star", "ManifestSchema")

# =============================================================================
# TEST FRAMEWORK (Simple implementation for Starlark)
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

def assert_in(value, collection, message="Value not in collection"):
    """Assert that value is in collection."""
    if value not in collection:
        test_results['failed'] += 1
        test_results['errors'].append("FAIL: {} - '{}' not in {}".format(message, value, collection))
    else:
        test_results['passed'] += 1

def run_tests():
    """Run all tests and print results."""
    print("\n" + "="*70)
    print("📋 MANIFEST MODULE - UNIT TESTS")
    print("="*70 + "\n")
    
    # Run test suites
    _test_constants()
    _test_schema()
    _test_errors()
    _test_facade()
    _test_backward_compatibility()
    
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
        print("\n🎉 All tests passed!")
    
    print("="*70 + "\n")
    
    return test_results['failed'] == 0

# =============================================================================
# TEST SUITE: Constants Module
# =============================================================================

def _test_constants():
    """Test constants module."""
    print("🔍 Testing constants module...")
    
    # Test MANIFEST_FILENAME
    assert_equal(
        'service.json',
        ManifestConstants.MANIFEST_FILENAME,
        "MANIFEST_FILENAME should match expected"
    )
    
    # Test VALID_APP_TYPES
    assert_in('frontend', ManifestConstants.VALID_APP_TYPES, "frontend should be valid app type")
    assert_in('backend', ManifestConstants.VALID_APP_TYPES, "backend should be valid app type")
    
    # Test VALID_STACKS (stacks discovered dynamically from filesystem)
    assert_true(type(ManifestConstants.VALID_STACKS) == "list", "VALID_STACKS should be a list")
    
    # Test VALID_FEATURES
    assert_in('nats', ManifestConstants.VALID_FEATURES, "nats should be valid feature")
    assert_in('prisma', ManifestConstants.VALID_FEATURES, "prisma should be valid feature")
    assert_in('drizzle', ManifestConstants.VALID_FEATURES, "drizzle should be valid feature")
    assert_in('api-client', ManifestConstants.VALID_FEATURES, "api-client should be valid feature")
    assert_in('env-config', ManifestConstants.VALID_FEATURES, "env-config should be valid feature")
    assert_in('api-index', ManifestConstants.VALID_FEATURES, "api-index should be valid feature")
    
    # Test MANIFEST_DEFAULTS
    assert_equal(4000, ManifestConstants.MANIFEST_DEFAULTS['port'], "Default port should be 4000")
    assert_equal('backend', ManifestConstants.MANIFEST_DEFAULTS['appType'], "Default appType should be backend")
    assert_equal(1, ManifestConstants.MANIFEST_DEFAULTS['replicas'], "Default replicas should be 1")
    
    # Test PORT_RANGES
    assert_not_none(ManifestConstants.PORT_RANGES['frontend'], "frontend should have port range")
    assert_not_none(ManifestConstants.PORT_RANGES['backend'], "backend should have port range")
    
    print("✅ Constants module tests complete\n")

# =============================================================================
# TEST SUITE: Schema Module
# =============================================================================

def _test_schema():
    """Test schema module."""
    print("🔍 Testing schema module...")
    
    # Test get_field
    app_name_schema = ManifestSchema.get_field('appName')
    assert_not_none(app_name_schema, "appName schema should exist")
    assert_equal('string', app_name_schema['type'], "appName should be string type")
    assert_true(app_name_schema['required'], "appName should be required")
    
    # Test get_required_fields
    required_fields = ManifestSchema.get_required_fields()
    assert_in('appName', required_fields, "appName should be required")
    assert_in('appType', required_fields, "appType should be required")
    assert_in('stack', required_fields, "stack should be required")
    
    # Test get_default
    default_port = ManifestSchema.get_default('port')
    assert_equal(4000, default_port, "Default port should be 4000")
    
    default_replicas = ManifestSchema.get_default('replicas')
    assert_equal(1, default_replicas, "Default replicas should be 1")
    
    # Test get_valid_values
    valid_app_types = ManifestSchema.get_valid_values('appType')
    assert_not_none(valid_app_types, "appType should have valid values")
    assert_in('frontend', valid_app_types, "frontend should be valid app type")
    assert_in('backend', valid_app_types, "backend should be valid app type")
    
    # Test is_required
    assert_true(ManifestSchema.is_required('appName'), "appName should be required")
    assert_true(ManifestSchema.is_required('appType'), "appType should be required")
    
    # Test is_deprecated
    # The 'dependencies' field is deprecated (replaced by 'dependsOn')
    is_dep = ManifestSchema.is_deprecated('dependencies')
    assert_true(is_dep, "dependencies field should be marked as deprecated")
    
    # Test get_all_fields
    all_fields = ManifestSchema.get_all_fields()
    assert_true(len(all_fields) > 0, "Should have field definitions")
    assert_in('appName', all_fields, "appName should be in all fields")
    assert_in('port', all_fields, "port should be in all fields")
    
    print("✅ Schema module tests complete\n")

# =============================================================================
# TEST SUITE: Errors Module
# =============================================================================

def _test_errors():
    """Test errors module."""
    print("🔍 Testing errors module...")
    
    # Test new error creation
    error = ManifestErrors.new(
        message="Test error",
        category=ManifestErrors.CATEGORY['SCHEMA'],
        severity=ManifestErrors.SEVERITY['ERROR'],
        context={'field': 'appName', 'path': '/test/manifest.json'},
    )
    
    assert_not_none(error, "Error should be created")
    assert_equal("Test error", error.message, "Error message should match")
    assert_equal('schema', error.category, "Error category should be schema")
    assert_equal('error', error.severity, "Error severity should be error")
    
    # Test format_error
    formatted = ManifestErrors.format(error)
    assert_not_none(formatted, "Formatted error should not be None")
    assert_true('[ERROR]' in formatted, "Formatted should include severity")
    assert_true('SCHEMA' in formatted, "Formatted should include category")
    
    # Test has_critical
    errors_list = [error]
    assert_true(not ManifestErrors.has_critical(errors_list), "Should not have critical errors")
    
    # Create a critical error
    critical_error = ManifestErrors.new(
        message="Critical test",
        category=ManifestErrors.CATEGORY['VALIDATION'],
        severity=ManifestErrors.SEVERITY['CRITICAL'],
    )
    critical_list = [critical_error]
    assert_true(ManifestErrors.has_critical(critical_list), "Should detect critical error")
    
    # Test get_summary
    summary = ManifestErrors.get_summary([error, critical_error])
    assert_equal(2, summary['total'], "Summary should show 2 errors")
    assert_equal(1, summary['by_severity']['CRITICAL'], "Should have 1 critical")
    assert_equal(1, summary['by_severity']['ERROR'], "Should have 1 error")
    
    print("✅ Errors module tests complete\n")

# =============================================================================
# TEST SUITE: Facade Module
# =============================================================================

def _test_facade():
    """Test main Manifest facade."""
    print("🔍 Testing Manifest facade...")
    
    # Test constants accessible via facade
    assert_equal('service.json', Manifest.filename, "Filename should be accessible")
    assert_not_none(Manifest.defaults, "Defaults should be accessible")
    assert_not_none(Manifest.app_types, "App types should be accessible")
    assert_not_none(Manifest.stacks, "Stacks should be accessible")
    assert_not_none(Manifest.features, "Features should be accessible")
    
    # Test schema utilities accessible
    assert_not_none(Manifest.get_field, "get_field should be accessible")
    assert_not_none(Manifest.get_required_fields, "get_required_fields should be accessible")
    assert_not_none(Manifest.get_default, "get_default should be accessible")
    
    # Test error utilities accessible
    assert_not_none(Manifest.format_error, "format_error should be accessible")
    assert_not_none(Manifest.group_errors, "group_errors should be accessible")
    assert_not_none(Manifest.has_critical_errors, "has_critical_errors should be accessible")
    
    # Test convenience functions
    assert_not_none(Manifest.is_valid_manifest, "is_valid_manifest should exist")
    assert_not_none(Manifest.get_resource_type, "get_resource_type should exist")
    
    print("✅ Facade module tests complete\n")

# =============================================================================
# TEST SUITE: Backward Compatibility
# =============================================================================

def _test_backward_compatibility():
    """Test backward compatibility with old imports."""
    print("🔍 Testing backward compatibility...")
    
    # Test that old imports still work
    load("../../manifest/constants.star",
        old_manifest_filename="MANIFEST_FILENAME",
        old_defaults="MANIFEST_DEFAULTS",
    )
    
    # Old import should return same values
    assert_equal(
        ManifestConstants.MANIFEST_FILENAME,
        old_manifest_filename,
        "Old import should match new constant"
    )
    
    assert_equal(
        ManifestConstants.MANIFEST_DEFAULTS['port'],
        old_defaults['port'],
        "Old defaults should match new defaults"
    )
    
    print("✅ Backward compatibility tests complete\n")

# =============================================================================
# MAIN
# =============================================================================

# Run tests when this file is loaded
# In production, this would be called by a test runner
# For now, we just define the test suite

def main():
    """Run all tests."""
    return run_tests()

# Export test functions for external test runner
TestManifest = struct(
    run=run_tests,
    test_constants=_test_constants,
    test_schema=_test_schema,
    test_errors=_test_errors,
    test_facade=_test_facade,
    test_backward_compatibility=_test_backward_compatibility,
)


# Inlined constant
DEFAULTS = {}

VALIDATION = {}
