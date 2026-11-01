---
name: bulk-reader
description: Ask a question about one or more large files (over about 350 lines) without loading them into context. Use when a hook blocks a full read, or when you need an overview, a list of functions, or "where is X handled" across big files.
---

# bulk-reader

A worker model (local Ollama first, Claude Haiku as the fallback) reads the files and returns short bullets. The files never enter your context.

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/bulk-read --question "Which methods call the database?" --paths src/Service.java src/Handler.java
```

- Ask one specific question per call. Every call stands alone, so repeat the paths for a follow-up.
- The answer comes from a small model: treat line numbers and names as leads and confirm them with `Read` and `offset`/`limit` before you rely on them or edit.
- To edit, do not use this skill for the text itself. Read only the section you need with `offset` and `limit`.
- Small files (under the threshold) are cheaper to just read.
