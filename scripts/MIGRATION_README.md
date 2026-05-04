# Google Sheets to PostgreSQL Migration

This guide explains how to migrate your data from Google Sheets to Neon PostgreSQL.

## Prerequisites

1. **Neon PostgreSQL Database**: Create a database at [neon.tech](https://neon.tech)
2. **Environment Variables**: Configure your `.env.local` file

## Environment Setup

Add these variables to your `.env.local` file:

```bash
# Google Sheets (existing)
GOOGLE_API_KEY=your_google_api_key
SHOP_SPREADSHEET_ID=your_spreadsheet_id

# Neon PostgreSQL (new)
PG_HOST=your-project.neon.tech
PG_USER=your_username
PG_DATABASE=your_database_name
PG_PASSWORD=your_password
```

### Getting Neon Credentials

1. Go to [neon.tech](https://neon.tech) and create a project
2. Navigate to your project dashboard
3. Click on "Connection Details"
4. Copy the connection parameters:
   - **Host**: `ep-xxx-xxx.region.aws.neon.tech`
   - **Database**: Usually `neondb` by default
   - **User**: Usually your email or `neondb_owner`
   - **Password**: Generated password (save it!)

## Migration Steps

### 1. Run the Migration Script

```bash
bun run scripts/migrate-sheets-to-postgres.ts
```

This script will:
- ✅ Connect to your Neon PostgreSQL database
- ✅ Create all necessary tables (parameters, currencies, payment_methods, etc.)
- ✅ Fetch data from your Google Sheets
- ✅ Migrate all data to PostgreSQL

### 2. Verify the Migration

The script will output progress for each step:

```
🚀 Starting migration from Google Sheets to PostgreSQL...
🔌 Connecting to PostgreSQL...
✅ Connected to PostgreSQL

📋 Creating database schema...
✅ Schema created successfully

📦 Migrating parameters...
✅ Migrated 12 parameters

💱 Migrating currencies...
✅ Migrated 3 currencies

💳 Migrating payment methods...
✅ Migrated 5 payment methods

...

✨ Migration completed successfully!
```

### 3. Update Your Application

After successful migration, your app will automatically use PostgreSQL instead of Google Sheets when the `PG_*` environment variables are configured.

The existing code in `processData.ts` already checks for database configuration and will prioritize PostgreSQL over Google Sheets.

## Database Schema

The migration creates the following tables:

### Main Database Tables
- **categorie**: Product categories with tax rates
- **article**: Products/articles with prices and availability
- **theme_admin**: UI theme colors (light/dark mode)

### POS Database Tables
- **parameters**: Shop configuration (name, address, email, etc.)
- **currency**: Supported currencies with rates and fees
- **payment_methods**: Available payment methods
- **printers**: Network printers configuration
- **users**: User accounts with roles

## Troubleshooting

### Connection Issues

If you get SSL/TLS errors:
```
Error: self signed certificate in certificate chain
```

The script already includes `ssl: { rejectUnauthorized: false }` for Neon compatibility.

### Missing Data

If some data is missing after migration:
1. Check that all sheets exist in your Google Spreadsheet
2. Verify sheet names match exactly (case-sensitive):
   - `Paramètres`
   - `Paiements`
   - `_Monnaies`
   - `Remises`
   - `Couleurs`
   - `Imprimantes`
   - `_Produits`
   - `Utilisateurs`

### Re-running the Migration

The script is **idempotent** - you can run it multiple times safely. It will:
- Delete existing data before inserting new data
- Recreate tables if needed

## Switching Back to Google Sheets

If you need to switch back to Google Sheets temporarily:

1. Remove or comment out the `PG_*` variables in `.env.local`
2. Restart your application

The app will automatically fall back to Google Sheets.

## Next Steps

After successful migration:

1. **Test your application** thoroughly
2. **Backup your PostgreSQL database** regularly (Neon provides automatic backups)
3. **Monitor performance** - PostgreSQL should be faster than Google Sheets API
4. **Consider removing Google Sheets dependencies** once you're confident in the migration

## Support

If you encounter issues:
1. Check the console output for specific error messages
2. Verify all environment variables are set correctly
3. Ensure your Neon database is accessible (check firewall/network settings)
