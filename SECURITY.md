# Security notes

## Tenant isolation
- Every business table uses Supabase RLS; no frontend direct service_role access.
- Organization ownership and staff membership are checked server-side in Postgres.
- `platform_settings` is publicly readable only for branding; do not put secrets into this table.
- Sensitive access must use verified Auth identity, never `user_metadata` for authorization.
- Bank reconciliation is manual until a properly authenticated/verified webhook exists.

## Reporting vulnerabilities
Do not put private keys, passwords, tokens, bank customer information, or live GPS coordinates in GitHub issues. Report issues privately to the repository owner.

## Pending commercial hardening
Lockfiles and dependency audits, live RLS verification, penetration tests, file retention, backup/restore drills, rate limiting, GPS privacy consent and webhook signature verification are required before selling.
