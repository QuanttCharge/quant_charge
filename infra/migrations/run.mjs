/**
 * Simple migration runner for local/dev.
 * Applies infra/migrations/*.sql to Postgres if not already recorded.
 * Handles docker-entrypoint-initdb.d already applying 001_init.sql.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function isApplied(client, id) {
  const { rows } = await client.query(
    'SELECT 1 FROM schema_migrations WHERE id = $1',
    [id],
  );
  return rows.length > 0;
}

async function markApplied(client, id) {
  await client.query(
    'INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING',
    [id],
  );
}

async function main() {
  const client = new pg.Client({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? 'ev_cms',
    user: process.env.POSTGRES_USER ?? 'evcms',
    password: process.env.POSTGRES_PASSWORD ?? 'evcms_secret',
  });

  await client.connect();
  await ensureMigrationsTable(client);

  // If docker-entrypoint already created core tables, record 001 as applied
  const { rows: existing } = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  `);
  if (existing.length && !(await isApplied(client, '001_init.sql'))) {
    await markApplied(client, '001_init.sql');
    console.log('recorded 001_init.sql (already applied by docker init)');
  }

  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (await isApplied(client, file)) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await markApplied(client, file);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  const ts = new pg.Client({
    host: process.env.TIMESCALE_HOST ?? 'localhost',
    port: Number(process.env.TIMESCALE_PORT ?? 5433),
    database: process.env.TIMESCALE_DB ?? 'ev_meter',
    user: process.env.TIMESCALE_USER ?? 'evcms',
    password: process.env.TIMESCALE_PASSWORD ?? 'evcms_secret',
  });
  await ts.connect();
  await ensureMigrationsTable(ts);
  const tsMigrationId = '001_meter_hypertable.sql';
  const { rows: meterExists } = await ts.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meter_samples'
  `);
  if (meterExists.length && !(await isApplied(ts, tsMigrationId))) {
    await markApplied(ts, tsMigrationId);
    console.log('recorded 001_meter_hypertable.sql (already applied by docker init)');
  } else if (!(await isApplied(ts, tsMigrationId))) {
    const tsSql = fs.readFileSync(
      path.join(__dirname, '../timescaledb/001_meter_hypertable.sql'),
      'utf8',
    );
    await ts.query(tsSql);
    await markApplied(ts, tsMigrationId);
    console.log('applied 001_meter_hypertable.sql');
  } else {
    console.log('skip 001_meter_hypertable.sql');
  }
  console.log('timescaledb hypertable ensured');
  await ts.end();
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
