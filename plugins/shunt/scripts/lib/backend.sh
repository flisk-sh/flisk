#!/usr/bin/env bash
# Shared transport for bulk-read and code-write: one stateless call to a worker model.
#
#   shunt_ask SYSTEM_PROMPT   (the user prompt is read from stdin; the answer goes to stdout)
#
# Backend order (SHUNT_BACKEND=auto|ollama|haiku, default auto): a local Ollama model first, then `claude -p --model haiku`.
# Env: SHUNT_OLLAMA_HOST (http://localhost:11434), SHUNT_OLLAMA_MODEL (qwen2.5-coder:7b), SHUNT_HAIKU_MODEL (haiku),
#      SHUNT_OLLAMA_CTX (32768, the context window requested from Ollama).

shunt_ollama() {
  local system="$1" prompt="$2" host="${SHUNT_OLLAMA_HOST:-http://localhost:11434}" body out
  command -v curl >/dev/null 2>&1 || return 1
  body=$(jq -n --arg model "${SHUNT_OLLAMA_MODEL:-qwen2.5-coder:7b}" --arg system "$system" --arg prompt "$prompt" \
    --argjson ctx "${SHUNT_OLLAMA_CTX:-32768}" \
    '{model: $model, stream: false, options: {temperature: 0.2, num_ctx: $ctx},
      messages: [{role: "system", content: $system}, {role: "user", content: $prompt}]}') || return 1
  out=$(curl -fsS --max-time "${SHUNT_TIMEOUT:-300}" -H 'Content-Type: application/json' -d "$body" "$host/api/chat" 2>/dev/null) || return 1
  out=$(printf '%s' "$out" | jq -r '.message.content // empty') || return 1
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

shunt_haiku() {
  local system="$1" prompt="$2"
  command -v claude >/dev/null 2>&1 || return 1
  # No tools and no session: the worker only answers. SHUNT_NESTED stops the hooks from firing inside it.
  printf '%s' "$prompt" | SHUNT_NESTED=1 claude -p --model "${SHUNT_HAIKU_MODEL:-haiku}" --tools "" \
    --no-session-persistence --system-prompt "$system"
}

shunt_ask() {
  local system="$1" prompt backend="${SHUNT_BACKEND:-auto}"
  prompt=$(cat)
  case "$backend" in
    ollama) shunt_ollama "$system" "$prompt" ;;
    haiku) shunt_haiku "$system" "$prompt" ;;
    auto)
      shunt_ollama "$system" "$prompt" && return 0
      echo "shunt: Ollama unavailable, falling back to Haiku" >&2
      shunt_haiku "$system" "$prompt"
      ;;
    *) echo "shunt: unknown SHUNT_BACKEND '$backend' (auto, ollama or haiku)" >&2; return 2 ;;
  esac
}
