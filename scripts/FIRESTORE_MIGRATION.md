# Firestore → PostgreSQL Migration Guide

This guide explains how to migrate transaction data from Firestore to PostgreSQL.

## 🎯 What This Does

Imports transaction data from Firestore into the `dc_pos` database:

-   **`facturation`** table - Transaction records
-   **`facturation_article`** table - Transaction line items

## 🚀 Usage

### Interactive Mode (Recommended)

Simply run without arguments for a guided experience:

```bash
bun run migrate-firestore
```

**If fetching from Firestore**, you'll be prompted for:

1. **Shop name**
2. **Export to JSON file?** (default: Yes) - Creates a backup
3. **Export file path** (default: `/home/flo/Downloads/firestore-{shopname}-{date}.json`)
4. **Import to database?** (default: Yes) - Import after export
5. **Dry run?** (if importing) - Preview without changes
6. **Overwrite existing?** (if importing) - Replace duplicates

**If reading from JSON file**, you'll be prompted for:

1. **File path**
2. **Dry run?** (default: No) - Preview without importing
3. **Overwrite existing?** (default: No) - Replace duplicate transactions

> 💡 **Smart behavior**: When reading from a file, export is skipped (you already have the file!). When fetching from Firestore, you can export AND/OR import in the same run.

### Command Line Mode

#### Export Only (Backup)

```bash
# Export from Firestore to JSON (no database import)
bun run migrate-firestore --shop myshop --export backup.json

# Export with auto-generated filename (saves to ~/Downloads/firestore-myshop-YYYY-MM-DD.json)
bun run migrate-firestore --shop myshop --export

# Or use the alias
bun run export-firestore --shop myshop --export
```

#### Import Only

```bash
# Import from Firestore to PostgreSQL (no export)
bun run migrate-firestore --shop myshop

# Import from JSON file to PostgreSQL
bun run migrate-firestore --file backup.json

# Dry run (preview only)
bun run migrate-firestore --shop myshop --dry-run

# Overwrite existing transactions
bun run migrate-firestore --shop myshop --overwrite
```

#### Export AND Import (Both)

```bash
# Export to JSON AND import to database in one run
bun run migrate-firestore --shop myshop --export backup.json --overwrite

# With dry run
bun run migrate-firestore --shop myshop --export backup.json --dry-run
```

## 📋 Options

| Option            | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `--shop <name>`   | Fetch from Firestore for this shop                               |
| `--file <path>`   | Read from JSON file instead of Firestore                         |
| `--export <path>` | Export to JSON file (can be combined with import)                |
| `--dry-run`       | Preview without making changes (requires import flags)           |
| `--overwrite`     | Overwrite existing transactions (enables import with `--export`) |

## 🔧 Environment Variables

Add to your `.env.local`:

```bash
# PostgreSQL (Neon)
PG_HOST=your-neon-host.neon.tech
PG_USER=neondb_owner
PG_PASSWORD=your_password

# Optional: Override database name (default: dc_pos)
PG_DATABASE=dc_pos

# For Firestore access (--shop mode)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# OR
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

## 📊 Database Schema

### `facturation` table

| Column            | Type         | Description                            |
| ----------------- | ------------ | -------------------------------------- |
| id                | SERIAL       | Primary key                            |
| panier_id         | VARCHAR(50)  | Order/cart ID                          |
| user_id           | INTEGER      | User who validated (FK to users)       |
| payment_method_id | INTEGER      | Payment method (FK to payment_methods) |
| amount            | FLOAT        | Total amount                           |
| currency_id       | INTEGER      | Currency (FK to currency)              |
| note              | VARCHAR(300) | Optional note                          |
| created_at        | TIMESTAMP    | Transaction date                       |
| updated_at        | TIMESTAMP    | Last modified                          |

### `facturation_article` table

| Column          | Type         | Description                |
| --------------- | ------------ | -------------------------- |
| id              | SERIAL       | Primary key                |
| facturation_id  | INTEGER      | FK to facturation          |
| article_id      | INTEGER      | Article ID (optional)      |
| label           | VARCHAR(100) | Product name               |
| category        | VARCHAR(50)  | Product category           |
| amount          | FLOAT        | Unit price                 |
| quantity        | INTEGER      | Quantity sold              |
| discount_amount | FLOAT        | Discount value             |
| discount_unit   | VARCHAR(10)  | Discount unit (%, €, etc.) |
| total           | FLOAT        | Line total                 |

## 🔄 Workflow Examples

### 1. Safe Migration (Recommended)

```bash
# Step 1: Export to JSON first (backup)
bun run migrate-firestore --shop myshop --export backup-2024.json

# Step 2: Preview the import
bun run migrate-firestore --file backup-2024.json --dry-run

# Step 3: Import to database
bun run migrate-firestore --file backup-2024.json
```

### 2. Direct Import

```bash
# Interactive mode (safest)
bun run migrate-firestore
# Choose: Firestore → Export to JSON → Yes

# Then import the JSON
bun run migrate-firestore --file firestore-export-*.json
```

### 3. Update Existing Data

```bash
# Overwrite existing transactions
bun run migrate-firestore --shop myshop --overwrite
```

## ⚠️ Important Notes

1. **Duplicate Detection**: Transactions are identified by `created_at` timestamp
2. **Payment Methods**: Unknown payment methods are automatically created
3. **Default User**: If no users exist, a default admin user is created automatically
4. **User Assignment**: First user in the database is used if validator is missing
5. **Skipped Methods**: Transactions with method "EFFACÉE" are skipped
6. **Currency**: Currently set to `null` (FK to currency table)

## 🐛 Troubleshooting

### "Payment method not found"

The script auto-creates payment methods, but you can pre-create them:

```sql
INSERT INTO payment_methods (label, currency) VALUES ('Espèce', '€');
INSERT INTO payment_methods (label, currency) VALUES ('Carte Bancaire', '€');
```

### Connection errors

Check your `.env.local` has correct PostgreSQL credentials and the database is running.

## 📈 Performance

-   **Small datasets** (<1000 transactions): ~10 seconds
-   **Medium datasets** (1000-10000 transactions): ~1-2 minutes
-   **Large datasets** (>10000 transactions): ~5-10 minutes

Each transaction is wrapped in a database transaction for safety.

## 🔐 Security

-   Never commit `.env.local` or service account keys
-   Use read-only Firestore credentials when possible
-   Keep JSON exports secure (they contain transaction data)
-   Consider encrypting backup files for long-term storage
