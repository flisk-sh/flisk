#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🎯 Flisk Landscape - RESOURCE MANIFEST GENERATOR
# =============================================================================
# Usage: ./generate-manifest.sh <stack> <resource-name> <type> [port]
#
# Examples:
#   ./generate-manifest.sh user user-management backend 4000
#   ./generate-manifest.sh order booking frontend 3002
#   ./generate-manifest.sh notification email worker 6001
#
# Debug Mode:
#   TILT_DEBUG=true ./generate-manifest.sh user user-management backend 4000
# =============================================================================

set -euo pipefail

# Enable debug mode if TILT_DEBUG is set
if [[ "${TILT_DEBUG:-false}" == "true" ]]; then
    set -x  # Print every command before executing it
    echo "🛠️ DEBUG MODE ENABLED"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

print_usage() {
    cat << EOF
${BLUE}╔═══════════════════════════════════════════════════════════════════╗
║  🎯  Flisk Landscape RESOURCE MANIFEST GENERATOR                          ║
╚═══════════════════════════════════════════════════════════════════╝${NC}

${YELLOW}Usage:${NC}
  $0 <stack> <resource-name> <type> [port]

${YELLOW}Arguments:${NC}
  stack         Technology stack (user, order, product, service, etc.)
  resource-name Resource name without type suffix (e.g., 'management', 'booking')
  type          Resource type: backend, frontend, worker, sdk
  port          (Optional) Port number. Auto-assigned if not specified.

${YELLOW}Examples:${NC}
  $0 user management backend 4000
  $0 order booking frontend 3002
  $0 notification email worker

${YELLOW}Port Conventions:${NC}
  Backend:   4000-5999
  Frontend:  3000-3999
  Worker:    6000-6999

${YELLOW}This will create:${NC}
  services/product/{stack}/{stack}-{name}-{type}/
    └── service.json

EOF
}

# Validate stack
VALID_STACKS=("user" "order" "product" "service" "notification" "analytics")

validate_stack() {
    local stack=$1
    for valid in "${VALID_STACKS[@]}"; do
        if [[ "$stack" == "$valid" ]]; then
            return 0
        fi
    done
    return 1
}

# Validate type
VALID_TYPES=("backend" "frontend" "worker" "sdk" "migrator")

validate_type() {
    local type=$1
    for valid in "${VALID_TYPES[@]}"; do
        if [[ "$type" == "$valid" ]]; then
            return 0
        fi
    done
    return 1
}

# Get default port based on type
get_default_port() {
    local type=$1
    case "$type" in
        backend)  echo 4099 ;;
        frontend) echo 3099 ;;
        worker)   echo 6099 ;;
        *)        echo 8000 ;;
    esac
}

# Get features based on type
get_default_features() {
    local type=$1
    case "$type" in
        backend)  echo '["nats", "prisma", "traefik", "infisical"]' ;;
        frontend) echo '["vitest"]' ;;
        worker)   echo '["nats", "infisical"]' ;;
        sdk)      echo '["vitest"]' ;;
        *)        echo '[]' ;;
    esac
}

# Main
main() {
    if [[ $# -lt 3 ]]; then
        print_usage
        exit 1
    fi

    local stack="$1"
    local resource_name="$2"
    local resource_type="$3"
    local port="${4:-$(get_default_port "$resource_type")}"

    # Validate inputs
    if ! validate_stack "$stack"; then
        echo -e "${RED}❌ Invalid stack: ${stack}${NC}"
        echo -e "   Valid stacks: ${VALID_STACKS[*]}"
        exit 1
    fi

    if ! validate_type "$resource_type"; then
        echo -e "${RED}❌ Invalid type: ${resource_type}${NC}"
        echo -e "   Valid types: ${VALID_TYPES[*]}"
        exit 1
    fi

    # Construct full resource name
    local full_name="${stack}-${resource_name}-${resource_type}"
    local resource_dir="${PROJECT_ROOT}/services/product/${stack}/${full_name}"
    local manifest_file="${resource_dir}/service.json"

    # Check if directory already exists
    if [[ -d "$resource_dir" ]]; then
        echo -e "${YELLOW}⚠️  Directory already exists: ${resource_dir}${NC}"
        if [[ -f "$manifest_file" ]]; then
            echo -e "${RED}❌ Manifest already exists. Aborting.${NC}"
            exit 1
        fi
        echo -e "${BLUE}   Creating manifest in existing directory...${NC}"
    else
        echo -e "${BLUE}📁 Creating resource directory: ${resource_dir}${NC}"
        mkdir -p "$resource_dir"
    fi

    # Get features
    local features
    features=$(get_default_features "$resource_type")

    # Build dependencies based on type
    local deps='[]'
    if [[ "$resource_type" == "backend" && "$stack" != "identity" ]]; then
        deps='["identity"]'
    fi

    # Generate manifest JSON
    cat > "$manifest_file" << EOF
{
  "\$schema": "../../.tilt/schemas/service-schema.json",
  "schemaVersion": 1,
  "appName": "${full_name}",
  "appType": "${resource_type}",
  "stack": "${stack}",
  "port": ${port},
  "replicas": 1,
  "featuresEnabled": ${features},
  "dependsOn": ${deps}
}
EOF

    echo -e "${GREEN}✅ Created manifest: ${manifest_file}${NC}"
    echo ""
    echo -e "${BLUE}📋 Generated manifest:${NC}"
    cat "$manifest_file"
    echo ""
    echo -e "${YELLOW}📝 Next steps:${NC}"
    echo "   1. Review and customize the manifest"
    echo "   2. Add source files to ${resource_dir}/src/"
    echo "   3. Create package.json if needed"
    echo "   4. Run 'tilt up' to discover the new resource"
    echo ""
    echo -e "${GREEN}🎉 Done! Resource '${full_name}' is ready for development.${NC}"
}

main "$@"
