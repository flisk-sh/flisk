const { defineConfig } = require('drizzle-kit');

// Flisk's DATABASE_URL ends in a Prisma-style ?schema=public that other drivers reject, so strip it.
// Flisk's Postgres has SSL off. `generate` (at image build) does not connect, so the URL may be unset then.
const url = process.env.DATABASE_URL ? `${process.env.DATABASE_URL.split('?')[0]}?sslmode=disable` : 'postgres://unused';

module.exports = defineConfig({
  dialect: 'postgresql',
  schema: './schema.js',
  out: './drizzle',
  dbCredentials: { url },
});
