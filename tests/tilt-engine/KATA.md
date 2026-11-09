# Flisk Coderetreat Kata: Property-Based Service Manifest Validation

**Duration:** 45 minutes  
**Audience:** Global Day of Coderetreat (GDCR) pairing sessions  
**Prerequisites:** Python 3.10+, `hypothesis`, `pytest`

---

## 1. Context & Motivation

Flisk discovers local microservices by scanning for `service.json` manifests in directories like `services/*/*`. The discovery engine inspects these manifests during stack initialization to configure ports, dependencies, container proxies, and local process runners.

If an invalid `service.json` slips past discovery, failures happen late—in Docker, Tilt, or port binding. To catch errors early with clear diagnostics, discovery enforces strict structural and value contracts before starting any services.

In this kata, you will use **Hypothesis** to write property-based tests for `service.json` validation:
- Valid manifests must **always pass** with zero issues.
- Invalid manifests must **always fail** with understandable, actionable error messages.
- Boundaries (appName lengths, type-specific port ranges, replica counts) must be strictly guarded.
- The validator must **never crash** on arbitrary JSON inputs.

---

## 2. Manifest Schema Summary

| Field | Type | Required | Rules & Boundaries |
|---|---|---|---|
| `appName` | `string` | **Yes** | 2–64 characters, kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), no leading/trailing `-` |
| `appType` | `string` | **Yes** | One of: `backend`, `frontend`, `library`, `migrator`, `sdk`, `worker`, `database`, `bring-your-own` |
| `stack` | `string` | **Yes** | Non-empty string naming the logical subsystem |
| `port` | `integer` | Conditional | Required except for `database` and `infra`. Standard range: 3000–9999. Type ranges: `frontend` (3000–5999), `backend` (4000–5999), `worker` (4000–6999), `migrator` (7000–7999). `bring-your-own`: 1–65535 |
| `featuresEnabled` | `array[string]` | Optional | Allowed: `api-client`, `env-config`, `api-index`, `prisma`, `nats`, `redis`, `infisical`, `vitest`, `traefik`, `websocket`, `graphql`, `grpc`, `vite-node`, `maintenance`, `ddd` |
| `dependsOn` | `array[string]` | Optional | Must be an array of resource names/aliases |
| `replicas` | `integer` | Optional | Integer between 1 and 10 |

---

## 3. 45-Minute Session Schedule

### Phase 1: Setup & Domain Model (0–5 min)

1. Set up a virtual environment and install test dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r tests/requirements.txt
   ```
2. Run existing tests to verify baseline:
   ```bash
   pytest tests/tilt-engine/test_manifest_properties.py -v
   ```

### Phase 2: Ping-Pong Round 1 — The Valid Invariant (5–15 min)

- **Driver (Ping):** Define Hypothesis strategies for valid manifests (`st_valid_standard_manifests`, `st_valid_byo_manifests`, `st_valid_database_manifests`).
- **Navigator (Pong):** Write a property test asserting that any manifest produced by these strategies returns `issues == []`.
- **Discussion:** Notice how property-based generation tests hundreds of combinations in under a second rather than relying on 3–4 static fixtures.

### Phase 3: Ping-Pong Round 2 — Boundaries & Missing Fields (15–25 min)

- **Driver (Pong):** Pick a required field (`appName`, `appType`, `stack`, `port`). Mutate a valid manifest by deleting that field.
- **Navigator (Ping):** Assert that `validate_manifest` reports `"Missing required field: <field>"`.
- **Driver (Pong):** Test boundaries:
  - `appName` with length 1 (too short) and 65 (too long).
  - Port 2999 and 10000 for standard apps; port 0 and 65536 for BYO apps.
  - Replicas 0 and 11.

### Phase 4: Ping-Pong Round 3 — Character Sets & Robustness (25–35 min)

- **Driver (Ping):** Test invalid `appName` characters: uppercase letters, symbols (`_`, `@`, `/`), and leading/trailing hyphens.
- **Navigator (Pong):** Test robustness on arbitrary dictionaries using `st.recursive()` or `st.dictionaries()`. Assert the validator returns a `list[str]` and never raises an unhandled exception.

### Phase 5: Retrospective & Real Bug Hunting (35–45 min)

- Compare property-based testing against example-based unit tests.
- Verify execution time: the property test suite must complete in **< 10 seconds** (target: ~2 seconds for 16 properties / 800+ runs).
- **Bug Hunt Exercise:** Check if `appType: "database"` requires a port in `runtime/discovery/validation.star` vs `runtime/discovery/manifest/validation.star`. Can you find the discrepancy?

---

## 4. Quick Reference Commands

```bash
# Run all manifest property tests
pytest tests/tilt-engine/test_manifest_properties.py -v

# Run with custom Hypothesis settings or reproduce a failed seed
pytest tests/tilt-engine/test_manifest_properties.py --hypothesis-show-statistics
pytest tests/tilt-engine/test_manifest_properties.py --hypothesis-seed=12345
```
