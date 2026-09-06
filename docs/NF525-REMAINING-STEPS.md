# NF525 — Remaining Compliance Steps

This document details the three remaining items from the NF525 compliance
remediation, with step-by-step instructions for each.

## 1. P2.9 — Anchor closures to the transaction chain

### What it means

Right now, closure hashes (daily, monthly, annual) are chained only to each
other — `daily_closures.previous_closure_hash` points to the previous daily
closure, but **not to the transaction chain**. This means someone could modify
transactions without affecting the closure chain, and the closure chain would
still verify as valid.

Anchoring means: include the **first and last transaction hash** of the period
in the closure hash computation. That way, if any transaction in the period is
modified, the closure hash no longer matches.

### What you need to do

#### Step 1 — Schema migration (no new columns needed)

The closure hash computation changes, but the column structure stays the same.
You only need to rechain the closures after deploying the new code.

#### Step 2 — Modify the hash computation in 3 files

In `src/app/api/sql/dailyClosure/route.ts`, the `generateClosureHash` function
currently uses:

```
[previousHash, date, ticket_count, total_amount, total_ht, total_tva,
 cancellation_count, cancellation_amount, refund_count, refund_amount].join('|')
```

Add two fields: `first_transaction_hash` and `last_transaction_hash` for the
day:

```
[previousHash, date, ticket_count, total_amount, total_ht, total_tva,
 cancellation_count, cancellation_amount, refund_count, refund_amount,
 first_tx_hash, last_tx_hash].join('|')
```

Fetch these with a query like:

```sql
SELECT hash FROM transactions
WHERE DATE(created_at) = $1 AND payment_method NOT IN (excluded...)
ORDER BY id ASC LIMIT 1   -- first_tx_hash
```

and `ORDER BY id DESC LIMIT 1` for the last.

Do the same in `src/app/api/sql/periodClosure/route.ts` for monthly and annual
closures (first/last daily closure hash of the period, or first/last
transaction hash).

#### Step 3 — Update `verifyIntegrity`

In `src/app/api/sql/verifyIntegrity/route.ts`, the `recomputeDailyClosureHash`
and `recomputePeriodClosureHash` functions must also include the first/last
transaction hash. This means the verify route must fetch the transaction hashes
for each closure period.

#### Step 4 — Update `scripts/populate-nf525-tables.ts`

The `dailyHash` and `periodHash` functions in the populate script must match
the new format.

#### Step 5 — Rechain all existing closures

After deploying, run:

```bash
bun run scripts/populate-nf525-tables.ts --force-rechain
```

This will prompt for "RECHAIN" confirmation and log a `chain_rebuild` audit
event.

#### Step 6 — Update regression tests

If there are any pinned closure hash values in tests, they will need to be
updated.

### Risk

- **Breaking change**: all existing closure hashes become invalid until the
  rechain script is run.
- **Must be deployed together with the rechain script execution**.
- **Test on a copy of the production database first**.

---

## 2. P3.14 — Price/VAT history table

### What it means

Right now, when a product price or VAT rate changes, we log an `article_change`
audit event that says "Updated N articles in category X". But the audit event
**does not capture the old and new values**. If someone changes a price from
€5 to €50, the audit event only says "articles were updated" — you can't see
what changed.

A dedicated `product_price_history` table would capture every price/VAT change
with the old value, new value, timestamp, and user.

### What you need to do

#### Step 1 — Create the table (both PostgreSQL and MariaDB)

Add to `scripts/create-postgres-database.sql` and
`scripts/create-mariadb-database.sql`:

```sql
CREATE TABLE IF NOT EXISTS dc_pos.product_price_history (
    id SERIAL PRIMARY KEY,
    product_reference VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    old_price NUMERIC(10,2),
    new_price NUMERIC(10,2),
    old_vat_rate NUMERIC(5,2),
    new_vat_rate NUMERIC(5,2),
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_product_price_history_ref
    ON dc_pos.product_price_history(product_reference);
CREATE INDEX IF NOT EXISTS idx_product_price_history_date
    ON dc_pos.product_price_history(changed_at DESC);
```

#### Step 2 — Capture old values before update in `updateArticles/route.ts`

Before the UPDATE query that changes article prices/VAT, fetch the current
values:

```sql
SELECT reference, name, price, vat FROM articles WHERE reference IN (...)
```

Then after the update, insert a row into `product_price_history` for each
product where price or VAT actually changed.

#### Step 3 — Add a UI to view price history (optional)

Add a "Historique des prix" button in the product editing screen that queries
the new table and displays it in a popup.

#### Step 4 — Run the migration on the production database

```sql
-- Run the CREATE TABLE statement above on the production DB
```

### Current mitigation (already in place)

The `article_change` audit event already provides traceability — you know
**when** articles were changed and **who** changed them. The
`product_price_history` table adds **what** changed (old → new values).
Without it, you can still trace changes by correlating audit events with
receipt data, but it's much less convenient.

### Recommendation

This is a **nice-to-have** for audit convenience, not a hard NF525 requirement.
The audit chain already provides the required traceability. Implement it when
you have time, but it's not blocking.

---

## 3. P3.15 — DB-level append-only protections

### What it means

Right now, the application code enforces immutability (soft deletes, hash
chaining, audit events). But a database administrator with direct DB access
can still:

- `UPDATE transactions SET amount = 0 WHERE id = 123`
- `DELETE FROM audit_events WHERE id = 999`
- `UPDATE transactions SET hash = 'fake' WHERE id = 123`

The hash verification would catch this, but only if someone runs it. DB-level
protections make it **impossible** to modify the data without elevated
privileges, even with direct DB access.

### What you need to do

#### For PostgreSQL (Neon):

##### Step 1 — Create a dedicated role for the POS application

```sql
-- Create a role that can only INSERT, not UPDATE/DELETE, on fiscal tables
CREATE ROLE pos_app_fiscal;

-- Grant INSERT and SELECT on fiscal tables
GRANT INSERT, SELECT ON dc_pos.transactions TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.transaction_items TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.audit_events TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.daily_closures TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.monthly_closures TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.annual_closures TO pos_app_fiscal;
GRANT INSERT, SELECT, UPDATE ON dc_pos.perpetual_totals TO pos_app_fiscal;

-- Do NOT grant UPDATE or DELETE on these tables
-- The app uses UPDATE on transactions (for soft-delete/sync), so we need
-- a more nuanced approach: allow UPDATE but prevent DELETE
```

**Important nuance**: The current code does
`UPDATE transactions SET payment_method = 'SUPPRIMÉE'` (soft delete) and
`UPDATE transactions SET hash = ...` (rechain). So the app role needs `UPDATE`
on `transactions`. But it should NOT have `DELETE` on `transactions`,
`transaction_items`, `audit_events`, or any closure table.

```sql
-- Grant UPDATE but NOT DELETE on transactions (soft-delete is an UPDATE)
GRANT UPDATE ON dc_pos.transactions TO pos_app_fiscal;
GRANT UPDATE ON dc_pos.transaction_items TO pos_app_fiscal;

-- audit_events: INSERT and SELECT only — no UPDATE, no DELETE
GRANT INSERT, SELECT ON dc_pos.audit_events TO pos_app_fiscal;

-- Closure tables: INSERT and SELECT only
GRANT INSERT, SELECT ON dc_pos.daily_closures TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.monthly_closures TO pos_app_fiscal;
GRANT INSERT, SELECT ON dc_pos.annual_closures TO pos_app_fiscal;
```

##### Step 2 — Use triggers to prevent UPDATE on audit_events and closures

Even without DELETE, someone with UPDATE access could modify an existing audit
event. Add triggers:

```sql
CREATE OR REPLACE FUNCTION dc_pos.prevent_update_audit_events()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only — UPDATE is not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit_events
    BEFORE UPDATE ON dc_pos.audit_events
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_update_audit_events();
```

Do the same for `daily_closures`, `monthly_closures`, `annual_closures`.

##### Step 3 — Apply the role to the application connection

In your `.env.local`, the `PG_USER` and `PG_PASSWORD` should use the
`pos_app_fiscal` role (or a role that has been granted `pos_app_fiscal`).

#### For MariaDB:

```sql
-- Create a user with limited privileges
CREATE USER 'pos_app'@'%' IDENTIFIED BY 'strong-password';
GRANT INSERT, SELECT, UPDATE ON dc_pos.transactions TO 'pos_app'@'%';
GRANT INSERT, SELECT, UPDATE ON dc_pos.transaction_items TO 'pos_app'@'%';
GRANT INSERT, SELECT ON dc_pos.audit_events TO 'pos_app'@'%';
GRANT INSERT, SELECT ON dc_pos.daily_closures TO 'pos_app'@'%';
GRANT INSERT, SELECT ON dc_pos.monthly_closures TO 'pos_app'@'%';
GRANT INSERT, SELECT ON dc_pos.annual_closures TO 'pos_app'@'%';
GRANT INSERT, SELECT, UPDATE ON dc_pos.perpetual_totals TO 'pos_app'@'%';
FLUSH PRIVILEGES;
```

For MariaDB triggers to prevent UPDATE on audit_events:

```sql
DELIMITER //
CREATE TRIGGER no_update_audit_events
BEFORE UPDATE ON dc_pos.audit_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only';
END//
DELIMITER ;
```

### What needs to change in the application code

**Critical**: The `handleSyncTransaction` function currently does
`DELETE FROM transaction_items WHERE transaction_id = ?` before reinserting.
With DB-level protections that prevent `DELETE` on `transaction_items`, this
will **fail**.

You have two options:

1. **Grant DELETE on `transaction_items` only** (since the app needs it for
   sync, and the `transaction_items_replaced` audit event captures the prior
   state)
2. **Change the sync logic** to use UPDATE-in-place for existing items and
   INSERT for new items, instead of DELETE+INSERT

Option 1 is simpler. Option 2 is more NF525-compliant but requires significant
code changes.

### Coordination needed

- **Neon**: You need admin access to your Neon project to create roles and
  triggers. This changes the DB security posture and should be tested on a
  branch first.
- **MariaDB**: Same — you need DB admin access.
- **Downtime**: The role switch requires a brief restart of the application
  with the new credentials.
- **Testing**: After applying, verify that all POS operations still work (add
  transaction, sync, delete, daily closure, etc.)

### Recommendation

This is the **most impactful** of the three items for actual security, but
also the **most operationally complex**. Recommended approach:

1. Test the trigger approach on a staging database first
2. Apply it during a maintenance window
3. Keep a fallback admin role that can bypass the triggers (for genuine
   emergencies)

---

## Summary of priorities

| Item | Effort | Risk | NF525 impact | Recommendation |
|------|--------|------|-------------|----------------|
| P2.9 (closure anchoring) | Medium | Breaking (requires rechain) | High — closes a verification gap | Do next, after testing on a DB copy |
| P3.14 (price history) | Low | Low | Low — audit events already provide traceability | Nice-to-have, not urgent |
| P3.15 (DB grants) | High | High — operational, could break the app | High — only real protection against direct DB tampering | Plan carefully, test on staging first |
