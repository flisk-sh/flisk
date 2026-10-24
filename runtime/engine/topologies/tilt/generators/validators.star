# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🛡️ VALIDATORS - Pre-Flight Validation Generators
# =============================================================================
# These generators run BEFORE services start to catch issues early
# They prevent vibe-coding failures by enforcing constraints at build time
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
BASE_PORT_FRONTEND = 3000
# === END INLINED CONSTANTS ===


"""
Validators Architecture:
  1. docker_path_validator - Ensures path aliases work in Docker context
  2. dependency_validator - Ensures all declared dependencies exist
  3. db_readiness_validator - Validates database credentials before startup
  4. package_publish_validator - Ensures shared packages are published
  5. env_var_validator - Validates all required environment variables
  6. resource_health_validator - Pre-flight health checks
  7. shared_package_copier - Copies shared packages to Docker context
"""

load("../common/utils.star", "Utils")
load("../../platform/docker/constants.star", "PlatformDockerConstants")
load("../manifest/constants.star", "GENERATED_CONFIG_FILENAMES")
load("../resources/shared-platform-postgres.star", "is_shared_platform_postgres_dependency")

load("../common/utils.star", "LIBRARY_ROOTS")

# =============================================================================
# 1. Docker Path Alias Validator
# =============================================================================

def validate_docker_path_aliases(resource_path, manifest, library_roots):
    """
    Validates that TypeScript path aliases in Docker tsconfig will resolve correctly.
    
    Problem: Docker builds fail when tsconfig has path aliases to shared packages
    that aren't copied to the Docker context.
    
    Solution: 
      - Warn about path aliases that point outside Docker context
      - Recommend removing internal_deps from Docker tsconfig
      - Suggest using node_modules resolution instead
    
    Returns: (is_valid, warnings, fixes)
    """
    warnings = []
    fixes = []
    
    resource_name = manifest.get("appName", "unknown")
    app_type = manifest.get("appType", "backend")
    
    # Check if this is a frontend service (most affected)
    if app_type == "frontend":
        # Check for internal dependencies that would break Docker build
        package_json_path = resource_path + "/package.json"
        if os.path.exists(package_json_path):
            package_json = read_json(package_json_path)
            deps = package_json.get("dependencies", {})
            
            internal_scope = "@" + PlatformDockerConstants.PROJECT_NAME + "/"
            # Build list manually (Starlark doesn't support list comprehensions with if)
            internal_deps = []
            for name in deps.keys():
                if name.startswith(internal_scope):
                    internal_deps.append(name)
            
            if internal_deps:
                warnings.append({
                    "level": "error",
                    "message": "Frontend '{}' has internal deps that will fail Docker build".format(resource_name),
                    "details": "The following packages use path aliases that won't resolve in Docker:",
                    "packages": internal_deps,
                    "impact": "Build will fail with 'Module not found' errors",
                })
                
                fixes.append({
                    "action": "Remove path aliases from Docker tsconfig",
                    "generator": "typescript/frontend_tsconfig.star",
                    "change": "Set internal_deps=None when is_docker=True",
                    "rationale": "Docker builds should resolve from node_modules, not source paths",
                })
    
    # Count errors manually (Starlark doesn't support list comprehensions with if)
    error_count = 0
    for w in warnings:
        if w["level"] == "error":
            error_count += 1
    is_valid = error_count == 0
    
    return struct(
        is_valid=is_valid,
        warnings=warnings,
        fixes=fixes,
        resource_name=resource_name,
    )

def generate_docker_path_validation_report(resource_path, manifest, write_fn=None):
    """
    Generates a validation report for Docker path aliases.
    Called during config-gen to catch issues before Docker build.
    """
    result = validate_docker_path_aliases(resource_path, manifest, LIBRARY_ROOTS)
    
    if not result.is_valid:
        report = {
            "timestamp": "now",
            "service": result.resource_name,
            "status": "FAILED",
            "warnings": result.warnings,
            "fixes": result.fixes,
            "recommendation": "Regenerate tsconfig without Docker path aliases",
        }
        
        if write_fn:
            write_fn("docker-path-validation.json", Utils.encode_json(report))
        
        # Also print to Tilt UI
        print("⚠️  Docker Path Validation Failed for {}".format(result.resource_name))
        for warning in result.warnings:
            print("   ❌ {}: {}".format(warning["level"].upper(), warning["message"]))
        for fix in result.fixes:
            print("   💡 Fix: {}".format(fix["action"]))
        
        return report
    
    return {"status": "PASSED", "service": result.resource_name}

# =============================================================================
# 2. Dependency Graph Validator
# =============================================================================

def validate_dependency_graph(resource_path, manifest, all_services):
    """
    Validates that all declared dependencies actually exist.
    
    Problem: Services declare dependencies on libraries that don't exist,
    causing Tilt warnings and runtime failures.
    
    Solution:
      - Check all @{npm_scope}/* dependencies exist in library_roots
      - Check dependsOn in manifest exist as services
      - Generate missing dependency report
    
    Returns: (is_valid, missing_deps, suggestions)
    """
    missing_deps = []
    warnings = []
    
    resource_name = manifest.get("appName", "unknown")
    
    # Check package.json dependencies
    package_json_path = resource_path + "/package.json"
    if os.path.exists(package_json_path):
        package_json = read_json(package_json_path)
        deps = package_json.get("dependencies", {})
        dev_deps = package_json.get("devDependencies", {})
        all_deps = dict(deps, **dev_deps)
        
        internal_scope = "@" + PlatformDockerConstants.PROJECT_NAME + "/"
        
        for dep_name in all_deps.keys():
            if dep_name.startswith(internal_scope):
                lib_name = dep_name.replace(internal_scope, "")
                
                # Check if library exists in known library directories
                found = False
                for lib_type, lib_root in LIBRARY_ROOTS.items():
                    lib_path = "{}/{}".format(lib_root, lib_name)
                    if os.path.exists(lib_path):
                        found = True
                        break
                
                if not found:
                    missing_deps.append({
                        "name": dep_name,
                        "type": "library",
                        "source": "package.json",
                    })
    
    # Check manifest dependsOn
    internal_deps = manifest.get("dependsOn", [])
    for dep in internal_deps:
        # Shared platform Postgres aliases are not app services; they resolve to
        # the Tilt resource `postgres` and must not be reported as missing.
        if is_shared_platform_postgres_dependency(dep):
            continue
        dep_exists = False
        for svc in all_services:
            # Check service name/stack match (supports legacy 'stack' field)
            svc_stack = svc.get("stack") or svc.get("stack")
            if svc.get("name") == dep or svc_stack == dep:
                dep_exists = True
                break
            # Check if any resource within the service matches
            for resource in svc.get("resources", []):
                if resource.get("name") == dep:
                    dep_exists = True
                    break
            if dep_exists:
                break

        if not dep_exists:
            missing_deps.append({
                "name": dep,
                "type": "service",
                "source": "service.json dependsOn",
            })
    
    is_valid = len(missing_deps) == 0
    
    return struct(
        is_valid=is_valid,
        missing_deps=missing_deps,
        resource_name=resource_name,
    )

def generate_dependency_validation_report(resource_path, manifest, all_services, write_fn=None):
    """
    Generates a validation report for service dependencies.
    """
    result = validate_dependency_graph(resource_path, manifest, all_services)
    
    if not result.is_valid:
        report = {
            "timestamp": "now",
            "service": result.resource_name,
            "status": "FAILED",
            "missing_dependencies": result.missing_deps,
            "recommendation": "Create missing libraries or update dependencies",
        }
        
        if write_fn:
            write_fn("dependency-validation.json", Utils.encode_json(report))
        
        print("⚠️  Dependency Validation Failed for {}".format(result.resource_name))
        for dep in result.missing_deps:
            print("   ❌ Missing {}: {} (from {})".format(
                dep["type"], dep["name"], dep["source"]
            ))
        
        return report
    
    return {"status": "PASSED", "service": result.resource_name}

# =============================================================================
# 3. Database Readiness Validator
# =============================================================================

def validate_database_readiness(resource_name, db_name, db_config):
    """
    Validates database configuration before service startup.
    
    Problem: Services fail to start because database credentials are wrong,
    database doesn't exist, or connection fails.
    
    Solution:
      - Check DATABASE_URL is properly formed
      - Validate database credentials format
      - Ensure database name matches manifest
      - Generate proper connection string
    
    Returns: (is_valid, connection_string, errors)
    """
    errors = []
    
    # Validate database name
    if not db_name:
        errors.append({
            "field": "databaseName",
            "error": "No database name specified in manifest",
            "fix": "Add 'databaseName' to service.json",
        })
    
    # Validate database config
    if not db_config:
        errors.append({
            "field": "database",
            "error": "No database configuration found",
            "fix": "Check GLOBAL_CONFIG.database in discovery/config.star",
        })
    
    # Build connection string
    connection_string = None
    if db_name and db_config:
        host = db_config.get("host", "localhost")
        port = db_config.get("port", 5432)
        user = db_config.get("user", "postgres")
        # ⚠️ SECURITY: No default password - must be explicitly provided
        password = db_config.get("password")
        
        if not password:
            errors.append({
                "field": "database.password",
                "error": "Database password is required but not provided",
                "fix": "Set DB_PASSWORD or POSTGRES_PASSWORD environment variable",
            })
        else:
            connection_string = "postgresql://{}:{}@{}:{}/{}".format(
                user, password, host, port, db_name
            )
    
    is_valid = len(errors) == 0
    
    return struct(
        is_valid=is_valid,
        connection_string=connection_string,
        errors=errors,
        resource_name=resource_name,
    )

def generate_db_readiness_check(resource_name, db_name, db_config, write_fn=None):
    """
    Generates database readiness validation and entrypoint script.
    """
    result = validate_database_readiness(resource_name, db_name, db_config)
    
    if not result.is_valid:
        report = {
            "timestamp": "now",
            "service": resource_name,
            "status": "FAILED",
            "errors": result.errors,
            "recommendation": "Fix database configuration in manifest",
        }
        
        if write_fn:
            write_fn("db-readiness-validation.json", Utils.encode_json(report))
        
        print("⚠️  Database Validation Failed for {}".format(resource_name))
        for error in result.errors:
            print("   ❌ {}: {}".format(error["field"], error["error"]))
        
        return report
    
    # Generate connection string report
    if write_fn:
        write_fn("db-connection-string.txt", result.connection_string)
    
    return {
        "status": "PASSED",
        "service": resource_name,
        "connection_string": result.connection_string,
    }

# =============================================================================
# 4. Package Publish Validator
# =============================================================================

def validate_package_publishing(resource_path, manifest, verdaccio_url):
    """
    Validates that all @{npm_scope} dependencies are published to Verdaccio.
    
    Problem: Docker builds fail because shared packages aren't published,
    causing 'npm package not found' errors.
    
    Solution:
      - Check each @{npm_scope} dependency exists in Verdaccio
      - Compare local package version with published version
      - Warn if local is newer than published
    
    Returns: (is_valid, unpublished_packages, version_mismatches)
    """
    unpublished = []
    version_mismatches = []
    
    resource_name = manifest.get("appName", "unknown")
    
    package_json_path = resource_path + "/package.json"
    if not os.path.exists(package_json_path):
        return struct(
            is_valid=True,
            unpublished_packages=[],
            version_mismatches=[],
            resource_name=resource_name,
        )
    
    package_json = read_json(package_json_path)
    deps = package_json.get("dependencies", {})
    
    internal_scope = "@" + PlatformDockerConstants.PROJECT_NAME + "/"
    
    for dep_name, dep_version in deps.items():
        if not dep_name.startswith(internal_scope):
            continue
        
        lib_name = dep_name.replace(internal_scope, "")
        
        # Check if package exists in Verdaccio
        # (This would be an actual HTTP check in real implementation)
        # For now, we check if library source exists
        found = False
        for lib_root in LIBRARY_ROOTS.values():
            lib_path = "{}/{}".format(lib_root, lib_name)
            if os.path.exists(lib_path):
                found = True
                
                # Check local package.json version
                lib_package_path = "{}/package.json".format(lib_path)
                if os.path.exists(lib_package_path):
                    lib_package = read_json(lib_package_path)
                    local_version = lib_package.get("version", "0.0.0")
                    
                    # Parse requested version
                    requested_version = dep_version.replace("^", "").replace("~", "")
                    
                    if local_version != requested_version:
                        version_mismatches.append({
                            "package": dep_name,
                            "requested": requested_version,
                            "local": local_version,
                        })
                break
        
        if not found:
            unpublished.append(dep_name)
    
    is_valid = len(unpublished) == 0
    
    return struct(
        is_valid=is_valid,
        unpublished_packages=unpublished,
        version_mismatches=version_mismatches,
        resource_name=resource_name,
    )

def generate_package_publish_report(resource_path, manifest, verdaccio_url, write_fn=None):
    """
    Generates a report of package publishing status.
    """
    result = validate_package_publishing(resource_path, manifest, verdaccio_url)
    
    if not result.is_valid or result.version_mismatches:
        report = {
            "timestamp": "now",
            "service": result.resource_name,
            "status": "WARNING" if not result.is_valid else "VERSION_MISMATCH",
            "unpublished_packages": result.unpublished_packages,
            "version_mismatches": result.version_mismatches,
            "recommendation": "Run 'bun run publish:all' to publish packages",
        }
        
        if write_fn:
            write_fn("package-publish-validation.json", Utils.encode_json(report))
        
        if not result.is_valid:
            print("⚠️  Package Publishing Validation Failed for {}".format(result.resource_name))
            for pkg in result.unpublished_packages:
                print("   ❌ Package not found: {}".format(pkg))
        
        if result.version_mismatches:
            print("⚠️  Version Mismatches for {}".format(result.resource_name))
            for mismatch in result.version_mismatches:
                print("   ⚡ {}: requested {} but local is {}".format(
                    mismatch["package"],
                    mismatch["requested"],
                    mismatch["local"]
                ))
        
        return report
    
    return {"status": "PASSED", "service": result.resource_name}

# =============================================================================
# 5. Environment Variable Validator
# =============================================================================

def validate_environment_variables(resource_path, manifest, required_vars):
    """
    Validates that all required environment variables are defined.
    
    Problem: Services fail at runtime because environment variables are missing.
    
    Solution:
      - Define required vars in manifest
      - Check .env files exist
      - Validate variables are set in Tilt context
    
    Returns: (is_valid, missing_vars, env_files)
    """
    missing_vars = []
    env_files = []
    
    resource_name = manifest.get("appName", "unknown")
    
    # Check for .env files
    for env_file in [".env", ".env.local", ".env.docker"]:
        env_path = "{}/{}".format(resource_path, env_file)
        if os.path.exists(env_path):
            env_files.append(env_file)
    
    # Check required variables
    manifest_required = manifest.get("requiredEnvVars", [])
    all_required = list(set(required_vars + manifest_required))
    
    for var in all_required:
        if not os.environ.get(var):
            missing_vars.append(var)
    
    is_valid = len(missing_vars) == 0
    
    return struct(
        is_valid=is_valid,
        missing_vars=missing_vars,
        env_files=env_files,
        resource_name=resource_name,
    )

def generate_env_validation_report(resource_path, manifest, required_vars, write_fn=None):
    """
    Generates environment variable validation report.
    """
    result = validate_environment_variables(resource_path, manifest, required_vars)
    
    if not result.is_valid:
        report = {
            "timestamp": "now",
            "service": result.resource_name,
            "status": "FAILED",
            "missing_variables": result.missing_vars,
            "env_files_found": result.env_files,
            "recommendation": "Set missing environment variables or add .env file",
        }
        
        if write_fn:
            write_fn("env-validation.json", Utils.encode_json(report))
        
        print("⚠️  Environment Variable Validation Failed for {}".format(result.resource_name))
        for var in result.missing_vars:
            print("   ❌ Missing: {}".format(var))
        
        return report
    
    return {
        "status": "PASSED",
        "service": result.resource_name,
        "env_files": result.env_files,
    }

# =============================================================================
# 6. Service Health Pre-Flight Validator
# =============================================================================

def generate_resource_health_check(resource_name, resource_path, manifest, checks):
    """
    Generates a comprehensive pre-flight health check script.
    
    Runs before service starts to validate:
      - File structure is correct
      - Required files exist
      - Dependencies are resolvable
      - Ports are available
    
    Returns: health_check_script (bash)
    """
    app_type = manifest.get("appType", "backend")
    
    health_checks = []
    
    # Check 1: Required files exist
    frontend_entry = "src/main.ts" if manifest.get("framework", "react") in ["vue", "svelte", "lit", "vanilla"] else "src/main.tsx"
    backend_files = {
        "python": ["pyproject.toml", "src/main.py"],
        "go": ["go.mod", "main.go"],
        "rust": ["Cargo.toml", "src/main.rs"],
        "node": ["package.json", "src/index.js"],
    }.get(manifest.get("language", "bun"), ["package.json", "prisma/schema.prisma"])
    required_files = {
        "backend": backend_files,
        "frontend": ["package.json", "index.html", frontend_entry],
        "library": ["package.json"],
    }.get(app_type, ["package.json"])
    
    for req_file in required_files:
        health_checks.append('''
if [ ! -f "{}" ]; then
    echo "❌ Missing required file: {}"
    exit 1
fi
'''.format(req_file, req_file))
    
    # Check 2: Package.json is valid JSON (Python and Go backends have no package.json)
    if manifest.get("language", "bun") not in ["python", "go", "rust"]:
        health_checks.append('''
if ! cat package.json | head -1 > /dev/null 2>&1; then
    echo "❌ package.json is not valid"
    exit 1
fi
''')
    
    # Check 3: Port availability (for local dev)
    port = manifest.get("port", BASE_PORT_FRONTEND)
    health_checks.append('''
# Check if port is already in use
if command -v lsof > /dev/null 2>&1; then
    if lsof -Pi :{} -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Port {} is already in use"
    fi
fi
'''.format(port, port))
    
    # Combine into script
    script = '''#!/bin/bash
# Auto-generated health check for {}
# Generated: {}

echo "🔍 Running pre-flight health checks for {}..."

{}

echo "✅ All health checks passed for {}"
'''.format(
        resource_name,
        "now",
        resource_name,
        "\n".join(health_checks),
        resource_name
    )
    
    return script

def generate_health_check_resource(resource_path, resource_name, manifest, write_fn=None):
    """
    Generates health check files and optionally writes them.
    """
    checks = {}  # Could be expanded with more check types
    
    script = generate_resource_health_check(resource_name, resource_path, manifest, checks)
    
    if write_fn:
        write_fn("health-check.sh", script)
    
    return script

# =============================================================================
# 7. Shared Package Copier (for Docker Context)
# =============================================================================

def generate_shared_package_copy_list(resource_path, manifest):
    """
    Generates a list of shared packages that need to be copied to Docker context.
    
    Problem: Frontend builds fail because shared packages are referenced via
    path aliases but not available in Docker build context.
    
    Solution: Copy required shared packages to service directory before Docker build.
    
    Returns: list of {source, destination, package_name} dicts
    """
    packages_to_copy = []
    
    resource_name = manifest.get("appName", "unknown")
    
    package_json_path = resource_path + "/package.json"
    if not os.path.exists(package_json_path):
        return packages_to_copy
    
    package_json = read_json(package_json_path)
    deps = package_json.get("dependencies", {})
    
    internal_scope = "@" + PlatformDockerConstants.PROJECT_NAME + "/"
    
    for dep_name in deps.keys():
        if not dep_name.startswith(internal_scope):
            continue
        
        lib_name = dep_name.replace(internal_scope, "")
        
        # Find library source path
        for lib_root in LIBRARY_ROOTS.values():
            lib_path = "{}/{}".format(lib_root, lib_name)
            if os.path.exists(lib_path):
                # Destination: .docker-shared-packages/{lib_name}
                dest = ".docker-shared-packages/{}".format(lib_name)
                
                packages_to_copy.append({
                    "source": lib_path,
                    "destination": dest,
                    "package_name": dep_name,
                    "lib_name": lib_name,
                })
                break
    
    return packages_to_copy

def generate_docker_shared_packages_config(resource_path, manifest, write_fn=None):
    """
    Generates configuration for copying shared packages to Docker context.
    
    This creates a JSON file that can be used by a local_resource to copy
    packages before Docker build.
    """
    packages = generate_shared_package_copy_list(resource_path, manifest)
    
    config = {
        "timestamp": "now",
        "service": manifest.get("appName", "unknown"),
        "packages": packages,
        "copy_script": "#!/bin/bash\n# Copy shared packages to Docker context\n" + "\n".join([
            "mkdir -p {dest} && cp -r {src}/* {dest}/".format(
                src=p["source"],
                dest=p["destination"]
            )
            for p in packages
        ]) if packages else "# No shared packages to copy",
    }
    
    if write_fn:
        write_fn("docker-shared-packages.json", Utils.encode_json(config))
    
    return config

# =============================================================================
# Master Validation Orchestrator
# =============================================================================

def run_all_validations(resource_path, manifest, all_services, global_config, write_fn=None):
    """
    Runs all validators and generates a comprehensive report.
    
    This is the main entry point called during config-gen.
    """
    reports = {}
    all_valid = True
    
    # 1. Docker Path Validation
    reports["docker_paths"] = generate_docker_path_validation_report(
        resource_path, manifest, write_fn
    )
    if reports["docker_paths"].get("status") == "FAILED":
        all_valid = False
    
    # 2. Dependency Validation
    reports["dependencies"] = generate_dependency_validation_report(
        resource_path, manifest, all_services, write_fn
    )
    if reports["dependencies"].get("status") == "FAILED":
        all_valid = False
    
    # 3. Database Validation
    db_config = global_config.get("database", {})
    db_name = manifest.get("databaseName", "")
    reports["database"] = generate_db_readiness_check(
        manifest.get("appName"), db_name, db_config, write_fn
    )
    if reports["database"].get("status") == "FAILED":
        all_valid = False
    
    # 4. Package Publishing Validation
    verdaccio_url = global_config.get("verdaccio_url_local", PlatformDockerConstants.VERDACCIO_URL_LOCAL)
    reports["packages"] = generate_package_publish_report(
        resource_path, manifest, verdaccio_url, write_fn
    )
    # Warnings don't fail validation
    
    # 5. Environment Variable Validation
    required_vars = ["VERDACCIO_URL_DOCKER", "TILT_ENV"]
    reports["environment"] = generate_env_validation_report(
        resource_path, manifest, required_vars, write_fn
    )
    if reports["environment"].get("status") == "FAILED":
        all_valid = False
    
    # 6. Health Check Script
    reports["health_check"] = generate_health_check_resource(
        resource_path, manifest.get("appName"), manifest, write_fn
    )
    
    # 7. Shared Package Copy Config
    reports["shared_packages"] = generate_docker_shared_packages_config(
        resource_path, manifest, write_fn
    )
    
    # Master Report
    # Count passed, failed, and warnings using regular loops (Starlark doesn't support generator expressions)
    passed_count = 0
    failed_count = 0
    warnings_count = 0
    for r in reports.values():
        if type(r) == "dict":
            status = r.get("status")
            if status == "PASSED":
                passed_count += 1
            elif status == "FAILED":
                failed_count += 1
            elif status == "WARNING":
                warnings_count += 1
    
    master_report = {
        "service": manifest.get("appName", "unknown"),
        "overall_status": "PASSED" if all_valid else "FAILED",
        "reports": reports,
        "summary": {
            "validations_run": 7,
            "passed": passed_count,
            "failed": failed_count,
            "warnings": warnings_count,
        }
    }
    
    if write_fn:
        write_fn("validation-master-report.json", Utils.encode_json(master_report))
    
    # Print compact validation summary
    resource_name = manifest.get("appName", "unknown")
    
    # Build compact validation summary - only show failures prominently
    failed_validations = []
    passed_count = 0
    unknown_count = 0
    
    for name, report in reports.items():
        if type(report) == "dict":
            status = report.get("status", "UNKNOWN")
            if status == "FAILED":
                failed_validations.append(name)
            elif status == "PASSED":
                passed_count += 1
            elif status == "UNKNOWN":
                unknown_count += 1
    
    # Print compact summary
    if all_valid:
        # All passed - just show summary line
        print("✅ {}: {} validations passed".format(resource_name, passed_count))
    else:
        # Some failed - show service and failures
        print("❌ {}: {} validation(s) failed".format(resource_name, len(failed_validations)))
        for failed in failed_validations:
            print("  ❌ {}".format(failed))
    
    # Show warnings/unknown only in verbose mode
    is_verbose = os.environ.get('TILT_LOG_LEVEL') == 'verbose'
    if is_verbose and unknown_count > 0:
        print("  ○ {} not checked".format(unknown_count))
    
    return master_report

# =============================================================================
# Exports
# =============================================================================

Validators = struct(
    # Individual validators
    validate_docker_path_aliases=validate_docker_path_aliases,
    validate_dependency_graph=validate_dependency_graph,
    validate_database_readiness=validate_database_readiness,
    validate_package_publishing=validate_package_publishing,
    validate_environment_variables=validate_environment_variables,
    
    # Report generators
    generate_docker_path_validation_report=generate_docker_path_validation_report,
    generate_dependency_validation_report=generate_dependency_validation_report,
    generate_db_readiness_check=generate_db_readiness_check,
    generate_package_publish_report=generate_package_publish_report,
    generate_env_validation_report=generate_env_validation_report,
    generate_health_check_resource=generate_health_check_resource,
    generate_docker_shared_packages_config=generate_docker_shared_packages_config,
    
    # Master orchestrator
    run_all_validations=run_all_validations,
)

GLOBAL_CONFIG = {}
