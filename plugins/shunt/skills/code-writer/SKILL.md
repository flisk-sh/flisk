---
name: code-writer
description: Delegate repetitive boilerplate (tests, DTOs, config stubs, similar-to-an-existing-file code) to a cheaper worker model that matches a reference file. Use when the spec is clear and an existing file shows the pattern.
---

# code-writer

A worker model (local Ollama first, Claude Haiku as the fallback) writes a file that matches your reference files. Only the result path and line count come back, not the code.

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/code-write --spec "Write tests for UserService" --reference tests/OrderTest.java --target tests/UserTest.java
```

- `--reference` is required: without a file to match, the output fits nothing in the project.
- Without `--target` the code is printed instead of written.
- Always review and run what comes back. Do not delegate anything subtle, security-sensitive or design-heavy.
