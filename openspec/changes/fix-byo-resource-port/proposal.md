## Why

The BYO resource command accepts `--port`, but the generated service configuration can retain the default port. A user who requests port 4500 can therefore see `Port: 4000` and receive a service manifest whose `.port` is not the requested value. This breaks the first-boot contract for bring-your-own services and can leave health checks targeting the wrong port.

## What Changes

- Make `flisk resource <name> --type byo --port <port>` persist and report the requested port.
- Preserve the existing BYO port validation errors and the supported range of 4000–5999.
- Add focused command tests for the accepted custom port and existing invalid-port behavior.

## Capabilities

### New Capabilities
- `byo-resource-port`: BYO resource creation honors a valid explicitly requested port in both user output and `service.json`.

### Modified Capabilities
- None.

## Non-goals

- Changing port defaults or validation messages.
- Changing other resource types, BYO boot orchestration, Tiltfile regeneration, or E2E probes.
- Changing the `service.json` schema or adding another BYO type/flag.

## Impact

- `cli/src/commands/resource.ts`
- `cli/src/commands/__tests__/resource-byo.test.ts`
