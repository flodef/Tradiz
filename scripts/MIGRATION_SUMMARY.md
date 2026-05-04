# Migration Summary: Google Sheets → Neon PostgreSQL

## What Was Created

### 1. Migration Script
**File**: `scripts/migrate-sheets-to-postgres.ts`

A comprehensive migration script that:
- Fetches all data from your Google Sheets
- Creates PostgreSQL tables matching your existing schema
- Migrates all data types: parameters, currencies, payment methods, products, users, colors, printers
- Handles errors gracefully with detailed logging
- Is idempotent (can be run multiple times safely)

### 2. PostgreSQL Connection Module
**File**: `src/app/api/sql/pg-db.ts`

A new database connection module for PostgreSQL that:
- Uses connection pooling for better performance
- Includes SSL configuration for Neon
- Provides helper functions to check if PostgreSQL is configured
- Separates main and POS database connections

### 3. Documentation
- **`scripts/MIGRATION_README.md`**: Complete migration guide
- **`scripts/MIGRATION_SUMMARY.md`**: This file - overview of changes

### 4. Test Script
**File**: `scripts/test-postgres-connection.ts`

A connection test utility that:
- Validates environment variables
- Tests database connectivity
- Lists existing tables
- Provides troubleshooting tips

### 5. Package.json Scripts
Added two new npm scripts:
```json
"migrate": "bun scripts/migrate-sheets-to-postgres.ts"
"test-db": "bun scripts/test-postgres-connection.ts"
```

## Environment Variables Required

Your `.env.local` needs these PostgreSQL variables:

```bash
PG_HOST=ep-xxx-xxx.region.aws.neon.tech
PG_USER=your_username
PG_DATABASE=your_database_name
PG_PASSWORD=your_password
```

**Note**: Your existing Google Sheets variables (`GOOGLE_API_KEY`, `SHOP_SPREADSHEET_ID`) are still needed for the migration script to fetch data.

## Database Schema

The migration creates these tables:

### Main Database (`PG_DATABASE`)
- **categorie**: Product categories with tax rates
- **article**: Products with prices, availability, and options
- **theme_admin**: UI theme colors (light/dark mode)

### POS Database (same as main, different prefix)
- **parameters**: Shop configuration (name, address, email, etc.)
- **currency**: Supported currencies with exchange rates and fees
- **payment_methods**: Payment methods with addresses and visibility
- **printers**: Network printer configurations
- **users**: User accounts with roles and keys

## How to Use

### Step 1: Test Connection
```bash
bun run test-db
```

This verifies your Neon database is accessible.

### Step 2: Run Migration
```bash
bun run migrate
```

This migrates all data from Google Sheets to PostgreSQL.

### Step 3: Verify
Your app will automatically use PostgreSQL when the `PG_*` variables are configured. The existing code in `processData.ts` already handles this.

## What Happens After Migration

1. **Automatic Fallback**: Your app checks for PostgreSQL first, then falls back to Google Sheets if not configured
2. **No Code Changes Needed**: The existing API routes already support both data sources
3. **Better Performance**: PostgreSQL queries are faster than Google Sheets API calls
4. **No Rate Limits**: Unlike Google Sheets API, PostgreSQL has no rate limits

## Data Mapping

### Google Sheets → PostgreSQL

| Sheet Name | PostgreSQL Table | Notes |
|------------|------------------|-------|
| Paramètres | parameters | Key-value pairs |
| _Monnaies | currency | Currencies with rates |
| Paiements | payment_methods | Payment options |
| Imprimantes | printers | Network printers |
| Utilisateurs | users | User accounts |
| Couleurs | theme_admin | UI theme colors |
| _Produits | categorie + article | Split into categories and products |
| Remises | (not migrated) | Currently uses JSON fallback |

## Important Notes

1. **Discounts**: The `Remises` sheet is not migrated because the current implementation uses a JSON fallback. This can be added later if needed.

2. **Options Field**: Product options from the spreadsheet are preserved in the `article.options` TEXT field.

3. **Tax Rates**: Tax rates are stored as decimals (e.g., 0.1 for 10%) in both category and article tables.

4. **Availability**: The `disponible` field uses 1 for available, 0 for unavailable (opposite of the sheet's "Indisponible" column).

5. **SSL Required**: Neon requires SSL connections. The scripts include `ssl: { rejectUnauthorized: false }` for compatibility.

## Rollback Plan

If you need to switch back to Google Sheets:

1. Remove or comment out `PG_*` variables in `.env.local`
2. Restart your application
3. The app will automatically use Google Sheets

Your PostgreSQL data remains intact for when you're ready to switch back.

## Next Steps

After successful migration:

1. **Test thoroughly**: Verify all features work with PostgreSQL
2. **Monitor performance**: PostgreSQL should be noticeably faster
3. **Set up backups**: Neon provides automatic backups, but verify they're enabled
4. **Update documentation**: Document your database schema for your team
5. **Consider removing Google Sheets**: Once confident, you can remove the Google Sheets dependency

## Support

If you encounter issues:
- Check `scripts/MIGRATION_README.md` for detailed troubleshooting
- Run `bun run test-db` to diagnose connection issues
- Verify all environment variables are set correctly
- Check Neon console for database status (it may auto-pause when inactive)
