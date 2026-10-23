# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - INTEGRATION TESTS (Phase 4)
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/tests/test_integration.star
# Purpose: Integration tests for discovery system integration
# Status: Phase 4 of manifest system refactoring
# =============================================================================

load("../__init__.star", "Manifest")
load("../integration.star", "ManifestIntegration")

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
# TEST SUITE: Integration Functions
# =============================================================================

def _test_integration_functions():
    """Test integration functions are accessible."""
    print("🔍 Testing integration functions...")
    
    # Test via facade
    assert_not_none(Manifest.load_and_validate_integration, "load_and_validate_integration should be accessible")
    assert_not_none(Manifest.load_all_integration, "load_all_integration should be accessible")
    assert_not_none(Manifest.convert_to_resource, "convert_to_resource should be accessible")
    assert_not_none(Manifest.get_validation_summary, "get_validation_summary should be accessible")
    assert_not_none(Manifest.check_port_conflicts, "check_port_conflicts should be accessible")
    assert_not_none(Manifest.check_dependencies_valid, "check_dependencies_valid should be accessible")
    
    # Test via integration module
    assert_not_none(ManifestIntegration.load_and_validate, "ManifestIntegration.load_and_validate should exist")
    assert_not_none(ManifestIntegration.load_all, "ManifestIntegration.load_all should exist")
    
    print("✅ Integration functions accessible\n")

# =============================================================================
# TEST SUITE: Convert to Resource
# =============================================================================

def _test_convert_to_resource():
    """Test manifest to resource conversion."""
    print("🔍 Testing convert_to_resource...")
    
    # Test backend conversion
    backend_manifest = {
        'appName': 'user-management-backend',
        'appType': 'backend',
        'stack': 'user',
        'port': 4000,
        'syncs': ['src', 'prisma'],
        '_resource_path': 'services/product/user/user-management-backend',
        '_manifest': {'runtime': 'bun'},
    }
    
    resource = Manifest.convert_to_resource(backend_manifest)
    
    assert_equal('user-management-backend', resource['name'], "Should preserve name")
    assert_equal(4000, resource['port'], "Should preserve port")
    assert_equal('user', resource['stack'], "Should preserve stack")
    assert_true('frontend' not in resource or not resource['frontend'], "Should not mark as frontend")
    assert_equal('services/product/user/user-management-backend', resource['_resource_path'], "Should preserve service path")
    
    # Test frontend conversion
    frontend_manifest = {
        'appName': 'user-management-frontend',
        'appType': 'frontend',
        'stack': 'user',
        'port': 3000,
        'backendName': 'user-management-backend',
        '_resource_path': 'services/product/user/user-management-frontend',
    }
    
    resource = Manifest.convert_to_resource(frontend_manifest)
    
    assert_equal('user-management-frontend', resource['name'], "Should preserve name")
    assert_true(resource.get('frontend', False), "Should mark as frontend")
    assert_equal('user-management-backend', resource['backendName'], "Should preserve backendName")
    
    print("✅ Convert to resource tests complete\n")

# =============================================================================
# TEST SUITE: Validation Summary
# =============================================================================

def _test_validation_summary():
    """Test validation summary generation."""
    print("🔍 Testing validation summary...")
    
    manifests = [
        {
            'appName': 'valid-service',
            'appType': 'backend',
            'stack': 'user',
            'port': 4000,
        },
        {
            'appName': 'valid-frontend',
            'appType': 'frontend',
            'stack': 'user',
            'port': 3000,
            'backendName': 'valid-service',
        },
    ]
    
    summary = Manifest.get_validation_summary(manifests)
    
    assert_equal(2, summary['total'], "Should count total manifests")
    assert_true('valid' in summary, "Should have valid count")
    assert_true('invalid' in summary, "Should have invalid count")
    assert_true('by_severity' in summary, "Should have severity breakdown")
    
    print("✅ Validation summary tests complete\n")

# =============================================================================
# TEST SUITE: Port Conflicts
# =============================================================================

def _test_port_conflicts():
    """Test port conflict detection."""
    print("🔍 Testing port conflict detection...")
    
    # No conflicts
    no_conflict = [
        {'appName': 'service-1', 'port': 4000},
        {'appName': 'service-2', 'port': 4001},
        {'appName': 'service-3', 'port': 4002},
    ]
    
    conflicts = Manifest.check_port_conflicts(no_conflict)
    assert_equal(0, len(conflicts), "Should find no conflicts for unique ports")
    
    # With conflicts
    with_conflict = [
        {'appName': 'service-1', 'port': 4000},
        {'appName': 'service-2', 'port': 4000},  # Conflict!
        {'appName': 'service-3', 'port': 4001},
    ]
    
    conflicts = Manifest.check_port_conflicts(with_conflict)
    assert_true(len(conflicts) > 0, "Should find port conflicts")
    
    print("✅ Port conflict tests complete\n")

# =============================================================================
# TEST SUITE: Dependency Validation
# =============================================================================

def _test_dependency_validation():
    """Test dependency validation across services."""
    print("🔍 Testing dependency validation...")
    
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
        {
            'appName': 'bad-service',
            'appType': 'backend',
            'stack': 'user',
            'port': 4001,
            'dependsOn': ['nonexistent-service'],  # Invalid
        },
    ]
    
    errors = Manifest.check_dependencies_valid(manifests)
    
    # Should find at least one error for nonexistent dependency
    assert_true(len(errors) > 0, "Should find dependency issues")
    
    print("✅ Dependency validation tests complete\n")

# =============================================================================
# TEST SUITE: Feature Flag
# =============================================================================

def _test_feature_flag():
    """Test the feature flag system."""
    print("🔍 Testing feature flag...")
    
    # Check if flag is accessible
    use_new = ManifestIntegration.use_new_system()
    assert_true(use_new != None, "Feature flag should return boolean")
    
    print("✅ Feature flag tests complete\n")

# =============================================================================
# MAIN
# =============================================================================

def run_tests():
    """Run all Phase 4 integration tests."""
    print("\n" + "="*70)
    print("📋 MANIFEST MODULE - PHASE 4 INTEGRATION TESTS")
    print("="*70 + "\n")
    
    # Run all test suites
    _test_integration_functions()
    _test_convert_to_resource()
    _test_validation_summary()
    _test_port_conflicts()
    _test_dependency_validation()
    _test_feature_flag()
    
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
        print("\n🎉 All Phase 4 integration tests passed!")
    
    print("="*70 + "\n")
    
    return test_results['failed'] == 0

# Export test runner
TestIntegration = struct(
    run=run_tests,
)
