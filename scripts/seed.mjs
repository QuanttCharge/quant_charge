/**
 * Seed demo tenant: platform admin, org admin, tariff, charger CHG001, wallet top-up.
 * Run after migrations: npm run seed
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const DEMO_ORG_ID = '00000000-0000-4000-8000-000000000001';
const PLATFORM_PHONE = '910000000001';
const ORG_ADMIN_PHONE = '919876543210';
const DRIVER_PHONE = '919999999999';

const client = new pg.Client({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'ev_cms',
  user: process.env.POSTGRES_USER ?? 'evcms',
  password: process.env.POSTGRES_PASSWORD ?? 'evcms_secret',
});

async function upsertUser(phone, { platformRole = null, name = null } = {}) {
  const existing = await client.query(`SELECT id FROM users WHERE phone = $1`, [phone]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users SET
         name = COALESCE($2, name),
         platform_role = COALESCE($3::platform_role, platform_role),
         updated_at = NOW()
       WHERE phone = $1`,
      [phone, name, platformRole],
    );
    return existing.rows[0].id;
  }
  const id = randomUUID();
  await client.query(
    `INSERT INTO users (id, phone, name, role, platform_role, is_active)
     VALUES ($1::uuid, $2, $3, 'driver', $4::platform_role, true)`,
    [id, phone, name, platformRole],
  );
  return id;
}

async function ensureWallet(userId, balancePaise) {
  await client.query(
    `INSERT INTO wallets (user_id, balance_paise, hold_paise)
     VALUES ($1::uuid, $2, 0)
     ON CONFLICT (user_id) DO UPDATE SET
       balance_paise = GREATEST(wallets.balance_paise, EXCLUDED.balance_paise),
       updated_at = NOW()`,
    [userId, balancePaise],
  );
}

async function main() {
  await client.connect();
  console.log('seeding…');

  await client.query(
    `INSERT INTO organizations (id, name, slug, status)
     VALUES ($1::uuid, 'Demo CPO', 'demo-cpo', 'active')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [DEMO_ORG_ID],
  );

  const platformId = await upsertUser(PLATFORM_PHONE, {
    platformRole: 'platform_admin',
    name: 'Platform Admin',
  });
  const adminId = await upsertUser(ORG_ADMIN_PHONE, { name: 'Demo Org Admin' });
  const driverId = await upsertUser(DRIVER_PHONE, { name: 'Demo Driver' });

  await ensureWallet(adminId, 50_000);
  await ensureWallet(driverId, 20_000);

  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status)
     VALUES ($1::uuid, $2::uuid, 'org_admin', 'active')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'org_admin', status = 'active'`,
    [DEMO_ORG_ID, adminId],
  );
  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status)
     VALUES ($1::uuid, $2::uuid, 'driver', 'active')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'driver', status = 'active'`,
    [DEMO_ORG_ID, driverId],
  );

  let tariffId;
  const existingTariff = await client.query(
    `SELECT id FROM tariffs WHERE organization_id = $1::uuid ORDER BY created_at ASC LIMIT 1`,
    [DEMO_ORG_ID],
  );
  if (existingTariff.rows[0]) {
    tariffId = existingTariff.rows[0].id;
  } else {
    const inserted = await client.query(
      `INSERT INTO tariffs (organization_id, name, rate_per_kwh_paise, rate_per_min_paise, gst_pct, is_active)
       VALUES ($1::uuid, 'Default', 1200, 50, 18, true)
       RETURNING id`,
      [DEMO_ORG_ID],
    );
    tariffId = inserted.rows[0].id;
  }

  await client.query(
    `INSERT INTO chargers (id, organization_id, vendor, model, status, tariff_id, lat, lng, address)
     VALUES ('CHG001', $1::uuid, 'QuantSim', 'SIM-22kW', 'Available', $2::uuid, 12.9716, 77.5946, 'Demo Hub Bengaluru')
     ON CONFLICT (id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       tariff_id = EXCLUDED.tariff_id,
       status = 'Available',
       updated_at = NOW()`,
    [DEMO_ORG_ID, tariffId],
  );

  await client.query(
    `INSERT INTO connectors (charger_id, connector_id, type, max_kw, status)
     VALUES ('CHG001', 1, 'Type2', 22, 'Available')
     ON CONFLICT (charger_id, connector_id) DO UPDATE SET status = 'Available'`,
  );

  // Default role permissions (ceilings)
  const rolePerms = [
    [
      'org_admin',
      [
        'chargers:read',
        'chargers:write',
        'sessions:read',
        'sessions:write',
        'sessions:own',
        'reservations:*',
        'live:*',
        'tariffs:read',
        'tariffs:write',
        'wallet:read',
        'wallet:own',
        'wallet:topup',
        'members:invite',
        'members:manage',
        'invoices:read',
        'payments:read',
        'roles:configure',
      ],
    ],
    [
      'org_operator',
      ['chargers:read', 'sessions:read', 'sessions:write', 'reservations:*', 'live:*'],
    ],
    ['org_finance', ['wallet:read', 'invoices:read', 'payments:read', 'sessions:read']],
    ['driver', ['sessions:own', 'wallet:own']],
  ];
  for (const [role, perms] of rolePerms) {
    await client.query(
      `INSERT INTO organization_role_permissions (organization_id, role, permissions)
       VALUES ($1::uuid, $2::org_role, $3::text[])
       ON CONFLICT (organization_id, role) DO UPDATE SET permissions = EXCLUDED.permissions`,
      [DEMO_ORG_ID, role, perms],
    );
  }

  console.log('seed complete', {
    orgId: DEMO_ORG_ID,
    platformPhone: PLATFORM_PHONE,
    orgAdminPhone: ORG_ADMIN_PHONE,
    driverPhone: DRIVER_PHONE,
    chargerId: 'CHG001',
    tariffId,
    platformUserId: platformId,
    note: 'Add more super admins via POST /platform/super-admins + X-Bootstrap-Secret',
  });
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
