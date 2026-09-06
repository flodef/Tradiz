# Changelog

All notable changes to Tradiz are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with the following fiscal-specific rule:

**Fiscal-impacting changes** (hash format, closure logic, VAT computation, archive
format, integrity verification) bump the **minor** version and must be documented
here with a "FISCAL" tag.

## [Unreleased]

### FISCAL — Chain integrity fix (critical)

#### Fixed — Chain breaks from normal POS usage

- `handleUpdateTransaction` (marks transaction as PROCESSING) was changing
  `payment_method`, `user_name`, and `device_id` — all hash inputs — without
  recomputing the hash. This caused hash mismatches on every update.
- `handleDeleteTransaction` and `handleHardDeleteTransaction` were changing
  `payment_method` without recomputing the hash. Same hash mismatch issue.
- `handleSyncTransaction` was recomputing the hash but not rechaining subsequent
  transactions, causing chain breaks for every transaction after the synced one.
- Root cause: any in-place modification of a transaction's hash-relevant fields
  changes its hash, which invalidates the `previous_hash` of all subsequent
  transactions.
- Fix: added `rechainFrom(connection, fromTransactionId)` that recomputes the
  hash of the modified transaction and all subsequent transactions in a single
  batch. Called after every update/delete/hardDelete/sync operation.
- All operations run inside the existing database transaction, so the rechain
  is atomic with the modification.

### FISCAL — NF525 Conformity Remediation

#### Changed — P0: Self-attestation

- Removed fabricated `NF525_CERTIFICATE_NUMBER` constant and all references to it.
- Receipt footer no longer prints `Certif. NF525-Tradiz-2026-001`.
- Receipt footer now prints `NAF` and legal form from configurable parameters
  (`SHOP_NAF`, `SHOP_LEGAL_FORM`) instead of hardcoded `NAF 5610C` and `SARL - RCS`.
- Receipt footer prints `Tradiz v{version}` without certification claim.
- Replaced `/api/sql/nf525Certificate` (JSON) with `/api/sql/attestation` (PDF).
- Attestation PDF follows BOI-LETTRE-000242 model with two volets (éditeur + utilisateur).
- UI: "Certificat" button replaced with "Attestation" button (green when signed,
  red when unsigned).
- Added `AttestationViewer` component for PDF display, print, and upload.
- Added `PUBLISHER` constant for éditeur identity in attestation volet 1.
- `USERDATA_PATH` env var passed from Electron to Next.js server for signed PDF storage.

#### Changed — P1: Tamper protection

- Transaction hash now includes a canonical digest of line items (label, quantity,
  unit price, total, VAT rate, discount amount). Items are sorted for deterministic
  ordering regardless of insertion order.
- `scripts/generate-transaction-hashes.ts` and `scripts/populate-nf525-tables.ts`
  now refuse to overwrite existing hashes/closures without `--force-rechain` flag,
  typed "RECHAIN" confirmation, and a `chain_rebuild` audit event.
- Transaction item replacement during sync now logs a
  `transaction_items_replaced` audit event capturing the prior item set.

#### Changed — P2: Verification

- `/api/sql/verifyIntegrity` now verifies all five chains: transactions,
  daily closures, monthly closures, annual closures, and audit events.
- Response includes per-chain status in `chains` object (backward-compatible
  top-level fields preserved).
- UI integrity popup now shows per-chain status.
- Audit event hash now includes `created_at` to prevent backdating.
- `insertAuditEvent` now passes `created_at` explicitly (not relying on DB default)
  so the stored value matches the hashed value.
- Fiscal archive (`/api/sql/fiscalArchive`) now includes HMAC-SHA256 signature
  when `FISCAL_ARCHIVE_HMAC_KEY` env var is set.
- Added `scripts/verify-archive.ts` for third-party archive signature verification.

#### Changed — P3: Governance

- Added audit event logging to fiscally relevant parameter update routes:
  `updateArticles`, `updateCurrencies`, `updatePaymentMethods`, `updateUsers`,
  `updateDiscounts`, `updateCategories`.
- Added `docs/CONFORMITE-NF525.md` compliance documentation.
- Added this CHANGELOG.md.

### Added

- `pdf-lib` as a direct dependency (was transitive via `@stafyniaksacha/facturx`).
- `SHOP_NAF` and `SHOP_LEGAL_FORM` parameter keys.
- `naf` and `legalForm` fields on `Shop` interface.
- `PUBLISHER` constant in `src/app/utils/constants.ts`.
- `src/app/utils/attestationPdf.ts` — BOI-LETTRE-000242 PDF builder.
- `src/app/api/sql/attestation/route.ts` — attestation API (GET/POST/DELETE).
- `src/app/components/AttestationViewer.tsx` — PDF viewer + upload component.
- `scripts/verify-archive.ts` — archive signature verification script.
- `docs/CONFORMITE-NF525.md` — compliance documentation.

### Removed

- `src/app/api/sql/nf525Certificate/route.ts` — replaced by attestation route.
- `NF525_CERTIFICATE_NUMBER` constant — was fabricated and misleadingly printed on receipts.

## Versioning Policy

Tradiz uses Semantic Versioning with the following fiscal-specific rules:

- **Major** (x.0.0): Breaking changes to the API, database schema, or receipt format.
- **Minor** (1.x.0): Fiscal-impacting changes (hash format, closure logic, VAT
  computation, archive format, integrity verification). These must be documented
  in this changelog with a "FISCAL" tag.
- **Patch** (1.0.x): Bug fixes, UI improvements, non-fiscal feature additions.

The version number is displayed on customer receipts and in the attestation PDF,
making it a fiscal identifier. Version bumps must be deliberate, not automatic.
