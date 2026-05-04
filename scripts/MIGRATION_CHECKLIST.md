# Migration Checklist

Use this checklist to ensure a smooth migration from Google Sheets to PostgreSQL.

## Pre-Migration

- [ ] **Create Neon account** at [neon.tech](https://neon.tech)
- [ ] **Create new project** in Neon dashboard
- [ ] **Copy connection credentials** (host, user, database, password)
- [ ] **Backup Google Sheets data** (just in case)
- [ ] **Verify Google Sheets access** is working
- [ ] **Check `.env.local` has Google credentials**:
  - [ ] `GOOGLE_API_KEY`
  - [ ] `SHOP_SPREADSHEET_ID`

## Environment Setup

- [ ] **Add PostgreSQL credentials to `.env.local`**:
  ```bash
  PG_HOST=ep-xxx-xxx.region.aws.neon.tech
  PG_USER=neondb_owner
  PG_DATABASE=neondb
  PG_PASSWORD=your_password_here
  ```
- [ ] **Verify no syntax errors** in `.env.local` (no spaces, no quotes)

## Testing

- [ ] **Test database connection**:
  ```bash
  bun run test-db
  ```
- [ ] **Verify output shows**:
  - [ ] ✅ Successfully connected
  - [ ] PostgreSQL version displayed
  - [ ] No error messages

## Migration

- [ ] **Run migration script**:
  ```bash
  bun run migrate
  ```
- [ ] **Verify migration output**:
  - [ ] ✅ Schema created successfully
  - [ ] ✅ Parameters migrated (should show ~12 parameters)
  - [ ] ✅ Currencies migrated
  - [ ] ✅ Payment methods migrated
  - [ ] ✅ Products migrated (categories + articles)
  - [ ] ✅ Users migrated (if applicable)
  - [ ] ✅ Colors migrated (if applicable)
  - [ ] ✅ Printers migrated (if applicable)
  - [ ] ✨ Migration completed successfully

## Verification

- [ ] **Check Neon dashboard**:
  - [ ] Navigate to your project
  - [ ] Go to "Tables" section
  - [ ] Verify all tables exist
  - [ ] Check row counts match expectations

- [ ] **Test application**:
  - [ ] Restart your app (if running)
  - [ ] Verify app loads without errors
  - [ ] Check shop parameters display correctly
  - [ ] Verify products/categories load
  - [ ] Test payment methods appear
  - [ ] Confirm currencies are correct
  - [ ] Test user authentication (if applicable)

## Post-Migration Testing

### Critical Features
- [ ] **Product display**: All products show with correct prices
- [ ] **Categories**: All categories appear correctly
- [ ] **Currencies**: Currency switching works
- [ ] **Payment methods**: All payment options available
- [ ] **User roles**: User permissions work correctly (if applicable)
- [ ] **Theme colors**: UI colors match expected theme

### Performance
- [ ] **Load time**: App loads faster than with Google Sheets
- [ ] **No rate limits**: Multiple rapid requests work fine
- [ ] **Consistent data**: Data doesn't change between refreshes

### Edge Cases
- [ ] **Offline mode**: Test if offline functionality still works
- [ ] **Multiple users**: Test concurrent access (if applicable)
- [ ] **Data updates**: Test admin panel updates (if applicable)

## Rollback Plan (if needed)

If something goes wrong:

- [ ] **Remove PostgreSQL variables** from `.env.local`:
  ```bash
  # Comment out or delete these lines:
  # PG_HOST=...
  # PG_USER=...
  # PG_DATABASE=...
  # PG_PASSWORD=...
  ```
- [ ] **Restart application**
- [ ] **Verify app works with Google Sheets again**
- [ ] **Review error logs** to understand what went wrong
- [ ] **Fix issues** and retry migration

## Cleanup (after successful migration)

- [ ] **Monitor for 1 week**: Ensure everything works smoothly
- [ ] **Set up Neon backups**: Verify automatic backups are enabled
- [ ] **Document your setup**: Note any custom configurations
- [ ] **Update team**: Inform team members about the change
- [ ] **Consider removing Google Sheets dependency** (optional, keep as backup)

## Maintenance

- [ ] **Monitor Neon dashboard** regularly
- [ ] **Check database size** and usage
- [ ] **Review query performance** in Neon analytics
- [ ] **Set up alerts** for database issues (optional)
- [ ] **Plan for scaling** if needed (Neon scales automatically)

## Troubleshooting

If you encounter issues, check:

- [ ] **Connection errors**: 
  - Database not paused in Neon
  - Credentials are correct
  - SSL is enabled

- [ ] **Missing data**:
  - Sheet names match exactly
  - Google API key is valid
  - Spreadsheet ID is correct

- [ ] **Performance issues**:
  - Check Neon dashboard for slow queries
  - Verify connection pooling is working
  - Review database indexes

- [ ] **Application errors**:
  - Check browser console for errors
  - Review server logs
  - Verify API routes are working

## Support Resources

- **Quick Start**: `scripts/QUICK_START.md`
- **Detailed Guide**: `scripts/MIGRATION_README.md`
- **Technical Details**: `scripts/MIGRATION_SUMMARY.md`
- **Test Connection**: `bun run test-db`
- **Neon Docs**: https://neon.tech/docs
- **Neon Status**: https://neonstatus.com

---

**Date Started**: _______________  
**Date Completed**: _______________  
**Migrated By**: _______________  
**Notes**: 
