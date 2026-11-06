# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Turn one Tilt resource's command, as `tilt alpha tiltfile-result` printed it, into files a script can replay.

usage: extract-resource-cmd.py <tiltfile-result.json> <resource name> <out dir>

Writes <out dir>/<name>.ps1 (the PowerShell -Command body, when the command is `powershell ... -Command <body>`),
<out dir>/<name>.env.json (the resource's environment) and <out dir>/<name>.args.json (the whole argv).
The CLI cuts a failed resource's message after 800 characters, so a replay of the exact command is the way to read its error.
"""

import json
import re
import sys
from pathlib import Path

result, name, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
text = Path(result).read_text(encoding="utf-8", errors="replace")
text = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", text)
data = json.loads(text[text.index("{") : text.rindex("}") + 1])
for manifest in data.get("Manifests", []):
    if manifest.get("Name") != name:
        continue
    spec = manifest.get("DeployTarget", {})
    cmd = spec.get("UpdateCmdSpec") or spec.get("ServeCmd") or {}
    args = cmd.get("args", [])
    env = dict(item.split("=", 1) for item in cmd.get("env", []) if "=" in item)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}.args.json").write_text(json.dumps(args, indent=1), encoding="utf-8")
    (out / f"{name}.env.json").write_text(json.dumps(env, indent=1), encoding="utf-8")
    if "-Command" in args:
        (out / f"{name}.ps1").write_text(args[args.index("-Command") + 1], encoding="utf-8")
    print(f"{name}: {len(args)} args, {len(env)} env vars")
    break
else:
    print(f"{name}: not in the result")
    sys.exit(2)
