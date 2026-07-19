-- Multi-tenant auth: organizations, memberships, org-scoped resources

CREATE TYPE platform_role AS ENUM ('platform_admin');
CREATE TYPE org_role AS ENUM ('org_admin', 'org_operator', 'driver');
CREATE TYPE org_status AS ENUM ('active', 'suspended');
CREATE TYPE membership_status AS ENUM ('active', 'invited', 'disabled');

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(64) NOT NULL UNIQUE,
  status        org_status NOT NULL DEFAULT 'active',
  gstin         VARCHAR(32),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              org_role NOT NULL DEFAULT 'driver',
  status            membership_status NOT NULL DEFAULT 'active',
  invited_phone     VARCHAR(20),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON organization_members (user_id);
CREATE INDEX idx_org_members_org ON organization_members (organization_id);

CREATE TABLE organization_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone             VARCHAR(20) NOT NULL,
  role              org_role NOT NULL DEFAULT 'driver',
  invited_by        UUID REFERENCES users(id),
  token             VARCHAR(64) NOT NULL UNIQUE,
  expires_at        TIMESTAMPTZ NOT NULL,
  accepted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, phone)
);
CREATE INDEX idx_org_invites_phone ON organization_invites (phone);

-- Platform role on users (nullable); membership role is source of truth for org users
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role platform_role;

-- Migrate legacy flat roles into platform_role where applicable, then drop old column usage
UPDATE users SET platform_role = 'platform_admin' WHERE role::text = 'admin' AND phone LIKE 'platform%';

ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE chargers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_chargers_org ON chargers (organization_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_org ON tariffs (organization_id);
CREATE INDEX IF NOT EXISTS idx_tx_org ON transactions (organization_id);

-- Demo tenant for existing rows (idempotent)
INSERT INTO organizations (id, name, slug, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'Demo CPO', 'demo-cpo', 'active')
ON CONFLICT (slug) DO NOTHING;

UPDATE tariffs SET organization_id = '00000000-0000-4000-8000-000000000001' WHERE organization_id IS NULL;
UPDATE chargers SET organization_id = '00000000-0000-4000-8000-000000000001' WHERE organization_id IS NULL;
UPDATE transactions SET organization_id = '00000000-0000-4000-8000-000000000001' WHERE organization_id IS NULL;
UPDATE reservations SET organization_id = '00000000-0000-4000-8000-000000000001' WHERE organization_id IS NULL;
UPDATE invoices SET organization_id = '00000000-0000-4000-8000-000000000001' WHERE organization_id IS NULL;
UPDATE payments SET organization_id = '00000000-0000-4000-8000-000000000001' WHERE organization_id IS NULL;

-- Keep users.role for backward compat during transition (Prisma will stop using it as auth source)
