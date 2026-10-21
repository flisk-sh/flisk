#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# ====================================================================
# Container Debug Helper Script
# Provides easy access to debugging running or failed Docker containers
# ====================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Container name filter: project name from .tdk/project.json (override with TDK_PROJECT_NAME)
PROJECT_FILTER="${TDK_PROJECT_NAME:-$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .tdk/project.json 2>/dev/null | head -1)}"
PROJECT_FILTER="${PROJECT_FILTER:-tdk-project}"
PROJECT_FILTER="${PROJECT_FILTER//-/[-_]}"

# Help text
show_help() {
    cat << EOF
${GREEN}Container Debug Helper${NC}

${BLUE}Usage:${NC}
  $0 [OPTIONS] [RESOURCE_NAME]

${BLUE}Options:${NC}
  -l, --list              List all running containers with their status
  -s, --shell SERVICE     Start an interactive shell in SERVICE
  -f, --failed            Show failed build containers
  -c, --command CMD       Run a specific command in the container
  -v, --verbose           Show verbose output
  -h, --help              Show this help message

${BLUE}Examples:${NC}
  # List all running containers
  $0 --list

  # Open shell in identity service
  $0 --shell identity-db-migrator

  # Run a diagnostic command
  $0 -s identity-db-migrator -c "bun install --verbose"

  # Check network connectivity
  $0 -s identity-db-migrator -c "nc -zv registry.npmjs.org 443"

  # View package.json
  $0 -s identity-db-migrator -c "cat package.json"

${BLUE}Common Debug Commands:${NC}
  # Network diagnostics
  nc -zv registry.npmjs.org 443
  nslookup registry.npmjs.org
  curl -I https://registry.npmjs.org

  # Bun diagnostics
  bun --version
  bun install --verbose --dry-run
  cat .npmrc
  cat bunfig.toml

  # File system
  ls -la node_modules
  du -sh node_modules
  df -h

EOF
}

# List containers
list_containers() {
    echo -e "${GREEN}=== Running Containers ===${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" | grep -iE "$PROJECT_FILTER"
    
    echo ""
    echo -e "${YELLOW}=== Recently Exited Containers ===${NC}"
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" | grep -iE "$PROJECT_FILTER" | grep -i "exited"
}

# Get container ID from service name
get_container_id() {
    local resource_name="$1"
    local container_id=$(docker ps -aq --filter "name=${resource_name}" | head -n1)
    
    if [ -z "$container_id" ]; then
        echo -e "${RED}Error: No container found for service '${resource_name}'${NC}" >&2
        echo -e "${YELLOW}Tip: Run '$0 --list' to see available containers${NC}" >&2
        return 1
    fi
    
    echo "$container_id"
}

# Start interactive shell
start_shell() {
    local resource_name="$1"
    local container_id=$(get_container_id "$resource_name") || return 1
    
    echo -e "${GREEN}Starting interactive shell in ${resource_name}...${NC}"
    echo -e "${BLUE}Container ID: ${container_id}${NC}"
    echo ""
    
    # Try sh first (alpine), then bash
    if docker exec -it "$container_id" sh -c "command -v bash" >/dev/null 2>&1; then
        docker exec -it "$container_id" bash
    else
        docker exec -it "$container_id" sh
    fi
}

# Run specific command
run_command() {
    local resource_name="$1"
    local command="$2"
    local container_id=$(get_container_id "$resource_name") || return 1
    
    echo -e "${GREEN}Running command in ${resource_name}:${NC} ${command}"
    echo -e "${BLUE}Container ID: ${container_id}${NC}"
    echo ""
    
    docker exec -it "$container_id" sh -c "$command"
}

# Show failed containers
show_failed() {
    echo -e "${RED}=== Failed/Exited Containers ===${NC}"
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" | grep -iE "$PROJECT_FILTER" | grep -iE "(exited|error)"
    
    echo ""
    echo -e "${YELLOW}To inspect logs of a failed container:${NC}"
    echo "  docker logs <container_name>"
    echo ""
    echo -e "${YELLOW}To restart a failed container:${NC}"
    echo "  docker start -ai <container_name>"
}

# Quick diagnostics menu
diagnostics_menu() {
    local resource_name="$1"
    
    echo -e "${GREEN}=== Quick Diagnostics Menu ===${NC}"
    echo "1) Check network connectivity"
    echo "2) View package.json and config files"
    echo "3) Test bun installation (dry-run)"
    echo "4) Check disk space and cache"
    echo "5) View environment variables"
    echo "6) Interactive shell"
    echo "q) Quit"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1)
            echo -e "${BLUE}Testing network connectivity...${NC}"
            run_command "$resource_name" "nc -zv registry.npmjs.org 443 && nc -zv Flisk Landscape-verdaccio 4873"
            ;;
        2)
            echo -e "${BLUE}Viewing configuration files...${NC}"
            run_command "$resource_name" "echo '=== package.json ===' && cat package.json && echo '' && echo '=== .npmrc ===' && cat .npmrc && echo '' && echo '=== bunfig.toml ===' && cat bunfig.toml"
            ;;
        3)
            echo -e "${BLUE}Testing bun installation (dry-run)...${NC}"
            run_command "$resource_name" "bun install --verbose --dry-run"
            ;;
        4)
            echo -e "${BLUE}Checking disk space and cache...${NC}"
            run_command "$resource_name" "df -h && echo '' && echo '=== Cache ===' && ls -lh /cache/bun && echo '' && echo '=== node_modules ===' && ls -lh node_modules | head -20"
            ;;
        5)
            echo -e "${BLUE}Environment variables:${NC}"
            run_command "$resource_name" "env | sort"
            ;;
        6)
            start_shell "$resource_name"
            ;;
        q|Q)
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
}

# Main script logic
main() {
    local action=""
    local resource_name=""
    local command=""
    local verbose=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -l|--list)
                action="list"
                shift
                ;;
            -s|--shell)
                action="shell"
                resource_name="$2"
                shift 2
                ;;
            -f|--failed)
                action="failed"
                shift
                ;;
            -c|--command)
                command="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$resource_name" ]; then
                    resource_name="$1"
                    action="menu"
                fi
                shift
                ;;
        esac
    done
    
    # Execute action
    case $action in
        list)
            list_containers
            ;;
        shell)
            if [ -n "$command" ]; then
                run_command "$resource_name" "$command"
            else
                start_shell "$resource_name"
            fi
            ;;
        failed)
            show_failed
            ;;
        menu)
            diagnostics_menu "$resource_name"
            ;;
        "")
            echo -e "${YELLOW}No action specified. Use --help for usage information.${NC}"
            list_containers
            ;;
        *)
            echo -e "${RED}Unknown action: $action${NC}"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
