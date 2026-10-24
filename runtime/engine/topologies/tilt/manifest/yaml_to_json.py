#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Convert YAML manifest to JSON for Tilt"""
import sys
import yaml
import json

if len(sys.argv) < 2:
    print("Usage: yaml_to_json.py <yaml_file>", file=sys.stderr)
    sys.exit(1)

yaml_file = sys.argv[1]
try:
    with open(yaml_file, 'r') as f:
        data = yaml.safe_load(f)
    print(json.dumps(data))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
