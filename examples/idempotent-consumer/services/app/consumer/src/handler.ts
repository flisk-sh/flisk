import { SQL } from "bun";

export type PaymentEvent = {
  event_id: string;
  type: "PaymentAuthorized" | "PaymentCaptured";
  payment_id: string;
  provider_account: string;
  capture_id?: string;
  amount_cents?: number;
};

const RANK = { authorized: 1, captured: 2 } as const;

/**
 * Apply one event. Returns after the transaction commits. The caller acknowledges
 * the broker only after this returns, never before.
 */
export async function handle(db: SQL, consumer: string, e: PaymentEvent): Promise<"applied" | "duplicate"> {
  return db.begin(async (tx) => {
    // 1. Dedupe by message. A redelivered event stops here.
    const seen = await tx`
      INSERT INTO inbox (consumer, event_id) VALUES (${consumer}, ${e.event_id})
      ON CONFLICT DO NOTHING RETURNING event_id`;
    if (seen.length === 0) return "duplicate" as const;

    // 2. Dedupe by business fact. A new event id for the same capture adds nothing.
    if (e.type === "PaymentCaptured" && e.capture_id) {
      await tx`
        INSERT INTO ledger (provider_account, capture_id, payment_id, amount_cents)
        VALUES (${e.provider_account}, ${e.capture_id}, ${e.payment_id}, ${e.amount_cents ?? 0})
        ON CONFLICT DO NOTHING`;
    }

    // 3. Forward-only state: set, never increment, and never go backwards.
    const status = e.type === "PaymentCaptured" ? "captured" : "authorized";
    await tx`
      INSERT INTO payments (payment_id, status) VALUES (${e.payment_id}, ${status})
      ON CONFLICT (payment_id) DO UPDATE SET status = EXCLUDED.status
      WHERE ${RANK[status]} > CASE payments.status WHEN 'captured' THEN 2 ELSE 1 END`;
    return "applied" as const;
  });
}
