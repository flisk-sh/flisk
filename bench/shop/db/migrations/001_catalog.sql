CREATE TABLE products (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents >= 0)
);
INSERT INTO products (name, description, price_cents) VALUES
  ('Espresso Beans 1kg', 'Dark roast, whole beans', 2400),
  ('Ceramic Mug', 'Hand glazed, 350 ml', 1200),
  ('Pour-over Kettle', 'Gooseneck, stainless steel', 4500);
