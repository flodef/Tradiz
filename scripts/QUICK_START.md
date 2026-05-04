# Quick Start: Migrate to PostgreSQL

## 🎯 Goal

Move your data from Google Sheets to Neon PostgreSQL for better performance and reliability.

## ⚡ Quick Steps

### 1️⃣ Get Neon Credentials (2 minutes)

1. Go to [neon.tech](https://neon.tech) and sign up/login
2. Create a new project
3. Copy these from the connection details:
    - Host (looks like: `ep-xxx-xxx.region.aws.neon.tech`)
    - Database (usually `neondb`)
    - User (usually `neondb_owner` or your email)
    - Password (save it!)

### 2️⃣ Update .env.local (1 minute)

Add to your `.env.local` file:

```bash
PG_HOST=ep-xxx-xxx.us-east-2.aws.neon.tech
PG_USER=neondb_owner
PG_PASSWORD=your_password_here
```

**Note**: The migration script will automatically create three databases: `dc`, `dc_pos`, and `dc_sys`

### 3️⃣ Test Connection (30 seconds)

```bash
bun run test-db
```

Expected output:

```
✅ Successfully connected to PostgreSQL!
📊 Database info: PostgreSQL 16.x ...
```

### 4️⃣ Run Migration (1-2 minutes)

```bash
bun run migrate
```

Expected output:

```
🚀 Starting migration...
✅ Connected to PostgreSQL
✅ Schema created successfully
✅ Migrated 12 parameters
✅ Migrated 3 currencies
✅ Migrated 5 payment methods
...
✨ Migration completed successfully!
```

### 5️⃣ Done! 🎉

Your app now uses PostgreSQL automatically. No code changes needed!

## 🔍 Verify It's Working

1. Restart your app (if running)
2. Check the console - you should see faster load times
3. Your data is now in PostgreSQL instead of Google Sheets

## 📊 What Got Migrated?

-   ✅ Shop parameters (name, address, email, etc.)
-   ✅ Currencies and exchange rates
-   ✅ Payment methods
-   ✅ Products and categories
-   ✅ Users and roles
-   ✅ Theme colors
-   ✅ Printer configurations

## 🆘 Troubleshooting

### "Connection failed"

-   Check your Neon database isn't paused (it auto-pauses after inactivity)
-   Verify credentials are correct
-   Try copying connection string directly from Neon console

### "Missing environment variable"

-   Make sure all `PG_*` variables are in `.env.local`
-   No spaces around the `=` sign
-   No quotes needed around values

### "No data migrated"

-   Verify `GOOGLE_API_KEY` and `SHOP_SPREADSHEET_ID` are still in `.env.local`
-   Check sheet names match exactly (case-sensitive)

## 🔄 Need to Switch Back?

Just remove the `PG_*` variables from `.env.local` and restart. Your app will use Google Sheets again.

## 📚 More Info

-   **Detailed guide**: `scripts/MIGRATION_README.md`
-   **Technical details**: `scripts/MIGRATION_SUMMARY.md`
-   **Migration script**: `scripts/migrate-sheets-to-postgres.ts`

## 💡 Pro Tips

1. **Run migration during low traffic** - takes 1-2 minutes
2. **Keep Google Sheets as backup** - don't delete it yet
3. **Test thoroughly** - verify all features work
4. **Monitor Neon dashboard** - check query performance
5. **Set up alerts** - Neon can notify you of issues

---

**Questions?** Check the detailed guides or test your connection with `bun run test-db`
