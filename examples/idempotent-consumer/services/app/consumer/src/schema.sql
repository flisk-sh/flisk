-- Dedupe by message: the same event delivered again is a no-op.
CREATE TABLE IF NOT EXISTS inbox (
  consumer   text NOT NULL,
  event_id   text NOT NULL,
  PRIMARY KEY (consumer, event_id)
);

-- Dedupe by business fact: a second event that describes the same capture is a no-op.
-- (provider_account, capture_id) is the identity; payment_id alone would drop partial captures.
CREATE TABLE IF NOT EXISTS ledger (
  provider_account text    NOT NULL,
  capture_id       text    NOT NULL,
  payment_id       text    NOT NULL,
  amount_cents     integer NOT NULL,
  PRIMARY KEY (provider_account, capture_id)
);

-- State only moves forward. A late "authorized" after "captured" is ignored.
CREATE TABLE IF NOT EXISTS payments (
  payment_id text PRIMARY KEY,
  status     text NOT NULL CHECK (status IN ('authorized', 'captured'))
);
