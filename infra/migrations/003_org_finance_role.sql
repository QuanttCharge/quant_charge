-- Add org_finance to org_role (must commit before use in later migration)
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'org_finance';
