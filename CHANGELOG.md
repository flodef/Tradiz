# Changelog

All notable changes to this project are documented here. Entries marked
**[NF525]** impact fiscal compliance (hash format, closure logic, VAT,
archive format) — see `docs/CONFORMITE-NF525.md` §Versioning.

## [1.657.0] — 2026-09-16

### Fixed

- **[NF525]** Device revocation no longer triggers a full page reload — the
  heartbeat soft-reloads data in the background and lands on the registration
  screen only when the device is genuinely gone (`a531df6`).

## [1.656.0] — 2026-09-16

### Fixed

- PostgreSQL heartbeat always reported `registered: false` (`rowCount` dropped
  by `execute()`) — every POS reloaded every 15 s. Now uses
  `UPDATE ... RETURNING` (`d694e8a`).

## [1.655.0] — 2026-09-16

### Fixed

- **[NF525]** Hung pool sockets are now destroyed instead of recycled
  (timeouts mark the connection broken; advisory locks can no longer leak on
  pooled clients — `pg_advisory_unlock_all()` on release) (`3f34538`).
- `resetDemo` now flushes the in-process API cache (`3f34538`).

## [1.653.0] — 2026-09-16

### Changed

- **[NF525]** A re-synced transaction whose recomputed hash is identical is
  now a no-op — no UPDATE, no item rewrite, no rechain, no audit event —
  strengthening the "rewrite only what changed" rule (`201d29a`).
- Hash-chain rechain batches raised to 2000 rows; advisory lock duration on
  `nf525_transactions` reduced accordingly (`201d29a`).

## [1.650.0] — 2026-09-15

### Fixed

- **[NF525]** Retry identity collision when re-dating a transaction after a
  `DAY_CLOSED` refusal (`c3a3b2b`).

## [1.648.0] — 2026-09-15

### Fixed

- **[NF525]** Distinct 409 refusal codes (`DAY_CLOSED`, `PERIOD_SEALED`,
  `PENDING_DRAFTS`, `ALREADY_CLOSED`), `redate_to` validation, period seal
  checked on insert (`686d6dd`).

## [1.646.0] — 2026-09-15

### Added

- **[NF525]** Append-only triggers deployed on hosted databases
  (`BEFORE UPDATE/DELETE` on fiscal tables, `BEFORE DELETE` on transactions,
  `BEFORE TRUNCATE` on `transactions`/`audit_events`) — scripts
  `harden-nf525-triggers-postgres.sql` / `harden-nf525-postgres.sql`
  (`70a1647`).

## [1.645.0] — 2026-09-15

### Added

- **[NF525]** Automatic daily closure at `closingHour`; drafts of a sealed
  day are re-dated to the open day (traced by `transaction_redated` audit
  event + `rechainFrom`) (`4ba4b16`).

## [1.642.0] — 2026-09-15

### Fixed

- **[NF525]** Sealed days and closure hierarchy protected against chain
  rewriting — writes that would break a seal are refused (`0a181a1`).

## [1.592.0] — 2026-09-13

### Fixed

- **[NF525]** Closure writes hardened; fiscal archive bounds fixed
  (`e90ad85`).

## [1.584.0] — 2026-09-13

### Changed

- **[NF525]** Closure hashes anchored to the transaction chain — a daily
  closure hash covers the first/last paid transaction hash of the day;
  monthly/annual cover the first/last child closure hash (P2.9) (`a337fef`).
