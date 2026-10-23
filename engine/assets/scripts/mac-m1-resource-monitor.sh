#!/bin/bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT

# Flisk Landscape Mac M1 Resource Monitor
# Monitors Docker container resource usage and provides optimization recommendations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🍎 Flisk Landscape Mac M1 Resource Monitor${NC}"
echo "=================================================="

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi

# Get Docker Desktop memory limit
DOCKER_MEMORY=$(docker system info 2>/dev/null | grep -i "total memory" | awk '{print $3 $4}' || echo "Unknown")
echo -e "${BLUE}🐳 Docker Memory Limit:${NC} $DOCKER_MEMORY"

# Get system memory info (macOS)
SYSTEM_MEMORY=$(system_profiler SPHardwareDataType | grep "Memory:" | awk '{print $2 $3}' || echo "Unknown")
echo -e "${BLUE}💻 System Memory:${NC} $SYSTEM_MEMORY"

echo ""

# Check running Flisk Landscape containers
PROJECT_CONTAINERS=$(docker ps --format "{{.Names}}" | grep -E "(postgres|redis|nats|kafka|traefik|clickhouse|elasticsearch|verdaccio|infisical)" | sort)

if [ -z "$PROJECT_CONTAINERS" ]; then
    echo -e "${YELLOW}⚠️  No Flisk Landscape containers are currently running${NC}"
    echo "Run 'tilt up' to start services"
    exit 0
fi

echo -e "${GREEN}📊 Running Flisk Landscape Containers:${NC}"
echo "=================================================="

# Get detailed stats for Flisk Landscape containers
TOTAL_MEMORY_MB=0
HIGH_CPU_COUNT=0
HIGH_MEMORY_COUNT=0

echo -e "${BLUE}Container Name${NC}\t\t${BLUE}CPU%${NC}\t${BLUE}Memory${NC}\t${BLUE}Status${NC}"
echo "------------------------------------------------------------------------"

while IFS= read -r container; do
    if [ -n "$container" ]; then
        # Get container stats
        STATS=$(docker stats --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}" "$container" 2>/dev/null || echo "N/A\tN/A")
        CPU_PERCENT=$(echo "$STATS" | cut -f1 | sed 's/%//')
        MEMORY_USAGE=$(echo "$STATS" | cut -f2)
        
        # Extract memory in MB for calculation
        MEMORY_MB=$(echo "$MEMORY_USAGE" | grep -o '[0-9.]*MiB' | sed 's/MiB//' || echo "0")
        if [ -z "$MEMORY_MB" ]; then
            MEMORY_MB=0
        fi
        
        # Status indicators
        STATUS=""
        if (( $(echo "$CPU_PERCENT > 50" | bc -l 2>/dev/null || echo 0) )); then
            STATUS="${RED}🔥 HIGH CPU${NC}"
            HIGH_CPU_COUNT=$((HIGH_CPU_COUNT + 1))
        elif (( $(echo "$MEMORY_MB > 200" | bc -l 2>/dev/null || echo 0) )); then
            STATUS="${YELLOW}⚠️  HIGH MEM${NC}"
            HIGH_MEMORY_COUNT=$((HIGH_MEMORY_COUNT + 1))
        else
            STATUS="${GREEN}✅ OK${NC}"
        fi
        
        # Add to total memory
        TOTAL_MEMORY_MB=$(echo "$TOTAL_MEMORY_MB + $MEMORY_MB" | bc -l 2>/dev/null || echo "$TOTAL_MEMORY_MB")
        
        # Format container name for display
        CONTAINER_DISPLAY=$(echo "$container" | sed 's/Flisk_//' | cut -c1-20)
        
        printf "%-20s\t%s%%\t%s\t%s\n" "$CONTAINER_DISPLAY" "$CPU_PERCENT" "$MEMORY_USAGE" "$STATUS"
    fi
done <<< "$PROJECT_CONTAINERS"

echo ""
echo -e "${BLUE}📈 Resource Summary:${NC}"
echo "=================================================="
echo -e "Total Memory Usage: ${YELLOW}~${TOTAL_MEMORY_MB}MB${NC}"
echo -e "High CPU Containers: ${RED}$HIGH_CPU_COUNT${NC}"
echo -e "High Memory Containers: ${YELLOW}$HIGH_MEMORY_COUNT${NC}"

# Recommendations
echo ""
echo -e "${BLUE}🔧 Mac M1 Optimization Recommendations:${NC}"
echo "=================================================="

if (( $(echo "$TOTAL_MEMORY_MB > 3000" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${RED}⚠️  HIGH MEMORY USAGE DETECTED!${NC}"
    echo "• Consider stopping unnecessary services with 'tilt down'"
    echo "• Avoid running monitoring + elk + all apps simultaneously"
    echo "• Use selective service loading: 'tilt up --focus <domain>' instead of all services"
elif (( $(echo "$TOTAL_MEMORY_MB > 2000" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${YELLOW}⚡ MODERATE MEMORY USAGE${NC}"
    echo "• Memory usage is acceptable for Mac M1"
    echo "• Monitor for performance issues"
else
    echo -e "${GREEN}✅ OPTIMAL MEMORY USAGE${NC}"
    echo "• Memory usage is well optimized for Mac M1"
fi

echo ""
echo "• Increase Docker Desktop memory limit to 6-8GB if experiencing issues"
echo "• Use 'tilt trigger resource-monitor' for regular monitoring"
echo "• Use 'tilt trigger memory-optimizer' for additional suggestions"

echo ""
echo -e "${BLUE}🔄 To refresh this report: ./.tilt/assets/scripts/mac-m1-resource-monitor.sh${NC}"
