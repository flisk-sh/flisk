# shunt

A Claude Code plugin that shunts I/O-heavy work to a cheaper model: big file reads and boilerplate generation go to a local Ollama model first, and to Claude Haiku when Ollama is not running. Claude only sees the short answer, not the files.

Inspired by Spotify's [shunt](https://github.com/spotify/portal-ai-plugins/tree/main/plugins/shunt), which delegates to AiKA through the Portal CLI. This version needs no account: the backends are Ollama and the `claude` CLI you already have.

## How it works

1. **Hooks** deny a full `Read` (or a bare `cat`/`head`/`tail`/`less`/`more`) of a file over 350 lines and point Claude at the bulk-reader skill. Reads with `offset` or `limit`, small files, images, PDFs, pipes, redirections and flags pass through.
2. **Scripts** `scripts/bulk-read` and `scripts/code-write` send one stateless call to a worker model.
3. **Skills** `bulk-reader` and `code-writer` tell Claude when and how to call them.

## Prerequisites

- `jq` and `curl`
- Optional but cheapest: [Ollama](https://ollama.com) with a coding model, `ollama pull qwen2.5-coder:7b`
- Fallback: the `claude` CLI (the worker runs `claude -p --model haiku` with no tools and no session)

## Install

```bash
claude plugin marketplace add flisk-sh/flisk
claude plugin install shunt@flisk
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SHUNT_MIN_LINES` | `350` | Files at or under this many lines are read normally |
| `SHUNT_BACKEND` | `auto` | `auto` (Ollama, then Haiku), `ollama` or `haiku` |
| `SHUNT_OLLAMA_HOST` | `http://localhost:11434` | Ollama server |
| `SHUNT_OLLAMA_MODEL` | `qwen2.5-coder:7b` | Ollama model |
| `SHUNT_OLLAMA_CTX` | `32768` | Context window requested from Ollama |
| `SHUNT_HAIKU_MODEL` | `haiku` | Model alias for the fallback |
| `SHUNT_TIMEOUT` | `300` | Seconds to wait for Ollama |

## Limits

A small model reads the files, so treat its answers as leads: confirm names and line numbers with `Read` before editing. Every call is one shot; nothing is stored between calls.

## Tests

```bash
plugins/shunt/evals/run.sh
```

The worker models are stubbed, so it needs neither Ollama nor Claude.
