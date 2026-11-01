#!/usr/bin/env bash
# Hook and transport tests for shunt. No network, no Ollama, no Claude: the worker models are stubbed.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"; [ -n "${srv:-}" ] && kill "$srv" 2>/dev/null' EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
expect() { # name, want, got
  if [ "$2" = "$3" ]; then ok; else bad "$1 (want '$2', got '$3')"; fi
}
contains() { # name, needle, haystack
  case "$3" in *"$2"*) ok ;; *) bad "$1 (no '$2' in '$3')" ;; esac
}

seq 1 400 >"$tmp/big.txt"
seq 1 10 >"$tmp/small.txt"

run_read() { printf '%s' "$1" | "$root/hooks/check-file-size" 2>/dev/null; echo $?; }
run_bash() { jq -n --arg c "$1" '{tool_input: {command: $c}}' | "$root/hooks/check-bash-read" 2>/dev/null; echo $?; }
rd() { jq -nc --arg f "$1" '{tool_input: {file_path: $f}}'; }

expect "read big file denied" 2 "$(run_read "$(rd "$tmp/big.txt")")"
expect "read small file allowed" 0 "$(run_read "$(rd "$tmp/small.txt")")"
expect "read missing file allowed" 0 "$(run_read "$(rd "$tmp/none.txt")")"
expect "read with limit allowed" 0 "$(run_read "$(jq -nc --arg f "$tmp/big.txt" '{tool_input:{file_path:$f,limit:50}}')")"
expect "read with offset allowed" 0 "$(run_read "$(jq -nc --arg f "$tmp/big.txt" '{tool_input:{file_path:$f,offset:10}}')")"
expect "read png allowed" 0 "$(cp "$tmp/big.txt" "$tmp/a.png"; run_read "$(rd "$tmp/a.png")")"
expect "read nested allowed" 0 "$(SHUNT_NESTED=1 run_read "$(rd "$tmp/big.txt")")"
expect "read threshold env" 0 "$(SHUNT_MIN_LINES=500 run_read "$(rd "$tmp/big.txt")")"
expect "read bad threshold env falls back" 2 "$(SHUNT_MIN_LINES=abc run_read "$(rd "$tmp/big.txt")")"

expect "cat big denied" 2 "$(run_bash "cat $tmp/big.txt")"
expect "head big denied" 2 "$(run_bash "head $tmp/big.txt")"
expect "cat small allowed" 0 "$(run_bash "cat $tmp/small.txt")"
expect "head -n allowed" 0 "$(run_bash "head -n 5 $tmp/big.txt")"
expect "cat piped allowed" 0 "$(run_bash "cat $tmp/big.txt | grep 1")"
expect "cat redirected allowed" 0 "$(run_bash "cat $tmp/big.txt > $tmp/out")"
expect "chained allowed" 0 "$(run_bash "cat $tmp/big.txt && ls")"
expect "other command allowed" 0 "$(run_bash "ls $tmp/big.txt")"
expect "cat missing allowed" 0 "$(run_bash "cat $tmp/none.txt")"

# Stub Ollama: answers every /api/chat with a fenced reply, so code-write has a fence to strip.
cat >"$tmp/stub.py" <<'PY'
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user = body["messages"][1]["content"]
        reply = "```\nOLLAMA:" + str(len(user) > 0) + "\n```"
        out = json.dumps({"message": {"content": reply}}).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
s = http.server.HTTPServer(("127.0.0.1", 0), H)
print(s.server_port, flush=True)
s.serve_forever()
PY
python3 "$tmp/stub.py" >"$tmp/port" &
srv=$!
for _ in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
export SHUNT_OLLAMA_HOST="http://127.0.0.1:$(cat "$tmp/port")"

mkdir -p "$tmp/bin"
cat >"$tmp/bin/claude" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
echo "HAIKU:${SHUNT_NESTED:-unset}"
SH
chmod +x "$tmp/bin/claude"

out=$("$root/scripts/bulk-read" --question "what?" --paths "$tmp/small.txt" 2>&1)
contains "bulk-read uses ollama" "OLLAMA:True" "$out"

out=$(PATH="$tmp/bin:$PATH" SHUNT_OLLAMA_HOST="http://127.0.0.1:1" "$root/scripts/bulk-read" --question "what?" --paths "$tmp/small.txt" 2>&1)
contains "falls back to haiku" "HAIKU:1" "$out"
contains "fallback is announced" "falling back to Haiku" "$out"

out=$(SHUNT_BACKEND=haiku PATH="$tmp/bin:$PATH" "$root/scripts/bulk-read" --question "what?" --paths "$tmp/small.txt" 2>&1)
contains "SHUNT_BACKEND=haiku skips ollama" "HAIKU:1" "$out"

out=$(SHUNT_BACKEND=ollama SHUNT_OLLAMA_HOST="http://127.0.0.1:1" PATH="$tmp/bin:$PATH" "$root/scripts/bulk-read" --question "what?" --paths "$tmp/small.txt" 2>&1)
expect "SHUNT_BACKEND=ollama does not fall back" "" "$out"

"$root/scripts/bulk-read" --question "x" >/dev/null 2>&1; expect "bulk-read needs paths" 2 $?
"$root/scripts/bulk-read" --question "x" --paths "$tmp/none" >/dev/null 2>&1; expect "bulk-read missing file" 1 $?
"$root/scripts/code-write" --spec "x" >/dev/null 2>&1; expect "code-write needs reference" 2 $?

"$root/scripts/code-write" --spec "x" --reference "$tmp/small.txt" --target "$tmp/sub/out.txt" >/dev/null 2>&1
expect "code-write writes target without fences" "OLLAMA:True" "$(cat "$tmp/sub/out.txt" 2>/dev/null)"

echo "shunt evals: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
