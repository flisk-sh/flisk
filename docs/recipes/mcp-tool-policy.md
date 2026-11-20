# MCP tool policy: refuse a `pay` call above a limit

An agent that can call a `pay` tool needs something that says no. This recipe adds one small check to the MCP scaffold that
runs before the tool does anything, and refuses an amount above a limit. It is plain code, with no new Flisk command.

## 1. The policy

Add this as `src/policy.ts` in a service made with `flisk resource <name> --type mcp`:

```ts
// src/policy.ts: decide before a tool runs. Plain code, so it is easy to read and to test.
// Swap it for a Cedar policy later if the rules outgrow a function; the call site stays the same.
export const PAY_LIMIT_CENTS = Number(process.env.PAY_LIMIT_CENTS ?? 50000);

export type Decision = { allowed: true } | { allowed: false; reason: string };

export function checkPay(amountCents: number, limitCents: number = PAY_LIMIT_CENTS): Decision {
  // A limit that is not a positive number (a typo in PAY_LIMIT_CENTS, say) must refuse, not wave everything through.
  if (!Number.isFinite(limitCents) || limitCents <= 0) {
    return { allowed: false, reason: 'the limit is not a positive number of cents, so every payment is refused' };
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { allowed: false, reason: 'the amount must be a positive whole number of cents' };
  }
  if (amountCents > limitCents) {
    return { allowed: false, reason: 'the amount ' + amountCents + ' is above the limit of ' + limitCents + ' cents' };
  }
  return { allowed: true };
}
```

- The limit is 50000 cents unless `PAY_LIMIT_CENTS` says otherwise (set it under `env` in `service.json`).
- A limit that is not a positive number, such as `PAY_LIMIT_CENTS=abc`, refuses every payment instead of allowing them all.
- A refusal carries a reason, so the agent can tell the user why instead of retrying.

## 2. The tool that uses it

In `src/index.ts`, import the check and register the tool next to `echo`:

```ts
import { checkPay } from './policy';

server.registerTool(
  'pay',
  {
    title: 'Pay',
    description: 'Pay an amount in cents to a payee. Amounts above the limit are refused.',
    inputSchema: { payee: z.string(), amountCents: z.number() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ payee, amountCents }) => {
    const decision = checkPay(amountCents);
    if (!decision.allowed) {
      return { isError: true, content: [{ type: 'text', text: 'Refused by policy: ' + decision.reason }] };
    }
    // Call your payment API here.
    return { content: [{ type: 'text', text: 'Paid ' + amountCents + ' cents to ' + payee }] };
  }
);
```

The check runs first. A refused call returns an MCP tool error and never reaches the line that moves money.

## What was run

- A unit test in `cli/src/backend-frameworks/mcp.test.ts` runs the code in step 1: 100 and 50000 cents are allowed, 50001 is
  refused with the reason above, and zero, negative and fractional amounts are refused. Another test fails if the code in this
  file and the example in the repository drift apart.
- The tool was added to a service made by `flisk resource payments --type mcp` (it typechecks with the scaffold's `tsc`), the
  server was started, and the MCP SDK client called `pay`:

| amountCents | Result |
| --- | --- |
| 100 | `Paid 100 cents to acme` |
| 50000 | `Paid 50000 cents to acme` |
| 50001 | error: `Refused by policy: the amount 50001 is above the limit of 50000 cents` |
| 0 | error: `Refused by policy: the amount must be a positive whole number of cents` |
| 12.5 | error: the same reason as 0 |

## Limits

- The policy sees only the arguments of one call. It does not know how much was paid earlier today. For a daily cap, keep the
  running total somewhere durable and pass it in.
- It protects this server only. A second server that can also move money needs its own check.
