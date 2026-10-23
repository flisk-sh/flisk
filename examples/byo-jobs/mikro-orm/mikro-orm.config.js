const { defineConfig } = require('@mikro-orm/postgresql');
const { Migrator } = require('@mikro-orm/migrations');

// Flisk's DATABASE_URL ends in a Prisma-style ?schema=public that other drivers reject, so strip it.
module.exports = defineConfig({
  clientUrl: process.env.DATABASE_URL.split('?')[0],
  extensions: [Migrator],
  entities: [],
  discovery: { warnWhenNoEntities: false },
  migrations: { path: './migrations', glob: '!(*.d).js', emit: 'js', snapshot: false },
});
