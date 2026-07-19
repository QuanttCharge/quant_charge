-- Per-org role permission overrides (requires org_finance enum from 003)

CREATE TABLE IF NOT EXISTS organization_role_permissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role              org_role NOT NULL,
  permissions       TEXT[] NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, role)
);

CREATE INDEX IF NOT EXISTS idx_org_role_perms_org
  ON organization_role_permissions (organization_id);

INSERT INTO organization_role_permissions (organization_id, role, permissions)
SELECT o.id, r.role, r.perms
FROM organizations o
CROSS JOIN (
  VALUES
    (
      'org_admin'::org_role,
      ARRAY[
        'chargers:read','chargers:write',
        'sessions:read','sessions:write','sessions:own',
        'reservations:*','live:*',
        'tariffs:read','tariffs:write',
        'wallet:read','wallet:own','wallet:topup',
        'members:invite','members:manage',
        'invoices:read','payments:read',
        'roles:configure'
      ]::text[]
    ),
    (
      'org_operator'::org_role,
      ARRAY[
        'chargers:read',
        'sessions:read','sessions:write',
        'reservations:*','live:*'
      ]::text[]
    ),
    (
      'org_finance'::org_role,
      ARRAY[
        'wallet:read','invoices:read','payments:read','sessions:read'
      ]::text[]
    ),
    (
      'driver'::org_role,
      ARRAY['sessions:own','wallet:own']::text[]
    )
) AS r(role, perms)
ON CONFLICT (organization_id, role) DO NOTHING;
