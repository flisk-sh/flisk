#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Convert JSON manifest to Tilt-compatible YAML resource"""
import sys
import json
import yaml
import uuid

if len(sys.argv) < 2:
    print("Usage: json_to_yaml.py <json_file>", file=sys.stderr)
    sys.exit(1)

json_file = sys.argv[1]
try:
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    # The YAML is a generated, committed mirror used only for Tilt resource tracking. A secret that someone put in service.json must
    # not be copied into it (the JWT secret belongs in the project .env; `flisk doctor` warns about it).
    data = {key: value for key, value in data.items() if key not in ("jwtSecret",)}

    # Deterministic: the mirror is regenerated on every run, so a wall-clock time or random uid would change the file each time.
    # The uid is derived from the content, and the timestamp is a fixed epoch (nothing reads it).
    now = "1970-01-01T00:00:00Z"
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(data, sort_keys=True)))
    
    # Match exact Tilt get uiresources format
    tilt_resource = {
        "apiVersion": "tilt.dev/v1alpha1",
        "kind": "UIResource",
        "metadata": {
            "annotations": {
                "tilt.dev/resource": data.get("appName", "unknown")
            },
            "creationTimestamp": now,
            "name": data.get("appName", "unknown"),
            "resourceVersion": "1",
            "uid": uid
        },
        "spec": data,
        "status": {
            "conditions": [
                {
                    "lastTransitionTime": now,
                    "status": "True",
                    "type": "UpToDate"
                }
            ],
            "runtimeStatus": "pending",
            "updateStatus": "ok"
        }
    }
    
    print(yaml.dump(tilt_resource, 
                   default_flow_style=False, 
                   sort_keys=False,
                   allow_unicode=True))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
