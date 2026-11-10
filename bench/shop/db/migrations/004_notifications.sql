CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
