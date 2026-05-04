# Complete Database Schema

This migration script creates **ALL tables** from the `db_struct.sql` file across three databases.

## Database Overview

The system uses **three separate databases**:
- **`dc`**: Main application database (18 tables)
- **`dc_pos`**: Point of Sale database (7 tables)
- **`dc_sys`**: System database (3 tables)

---

## Database: `dc` (18 tables)

### Core Tables
1. **`categorie`** - Product categories
2. **`article`** - Products/items for sale
3. **`formule`** - Meal combos/formulas
4. **`element_formule`** - Formula elements/components

### Order Management
5. **`panier`** - Shopping cart/orders
6. **`rel_panier_article`** - Cart ↔ Article relationship
7. **`rel_panier_formule`** - Cart ↔ Formula relationship
8. **`rel_pf_ef`** - Formula instance ↔ Element relationship
9. **`rel_ef_article`** - Element ↔ Article relationship
10. **`rel_ef_formule`** - Element ↔ Formula relationship

### Restaurant Management
11. **`table`** - Restaurant tables
12. **`rel_table_panier`** - Table ↔ Cart relationship
13. **`mur`** - Walls (for floor plan)

### Configuration
14. **`config_etablissement`** - Restaurant configuration
15. **`theme_admin`** - Admin UI theme
16. **`theme_client`** - Client UI theme

### Logging
17. **`log`** - Application logs

---

## Database: `dc_pos` (7 tables)

### User & Auth
1. **`users`** - User accounts with roles

### Financial
2. **`currency`** - Supported currencies
3. **`payment_methods`** - Payment options
4. **`facturation`** - Invoices/transactions
5. **`facturation_article`** - Invoice line items

### Configuration
6. **`parameters`** - System parameters (key-value)
7. **`printers`** - Network printers

---

## Database: `dc_sys` (3 tables)

### System Management
1. **`log`** - System logs
2. **`ota`** - Over-the-air update tokens
3. **`web_token`** - Web authentication tokens

---

## Tables Populated by Migration

The following tables are **automatically populated** from Google Sheets:

### From `dc` database:
- ✅ **`categorie`** ← `_Produits` tab (categories)
- ✅ **`article`** ← `_Produits` tab (products)
- ✅ **`theme_admin`** ← `Couleurs` tab

### From `dc_pos` database:
- ✅ **`currency`** ← `_Monnaies` tab
- ✅ **`parameters`** ← `Paramètres` tab
- ✅ **`payment_methods`** ← `Paiements` tab
- ✅ **`printers`** ← `Imprimantes` tab
- ✅ **`users`** ← `Utilisateurs` tab

### Empty Tables (Created but Not Populated)

All other tables are created empty and ready for use by your application:

**`dc` database:**
- `formule`, `element_formule`
- `panier`, `rel_panier_article`, `rel_panier_formule`, `rel_pf_ef`, `rel_ef_article`, `rel_ef_formule`
- `table`, `rel_table_panier`, `mur`
- `config_etablissement`, `theme_client`, `log`

**`dc_pos` database:**
- `facturation`, `facturation_article`

**`dc_sys` database:**
- `log`, `ota`, `web_token`

---

## Migration Output

When you run `bun run migrate`, you'll see:

```
🚀 Starting migration from Google Sheets to PostgreSQL...

🔌 Testing PostgreSQL connection...
✅ Connected to PostgreSQL

🗄️  Creating databases...
✅ Created dc database
✅ Created dc_pos database
✅ Created dc_sys database

📋 Creating database schemas...
✅ DC schema created successfully
✅ DC_POS schema created successfully
✅ DC_SYS schema created successfully

📦 Migrating parameters...
✅ Migrated 12 parameters

💱 Migrating currencies...
✅ Migrated X currencies

💳 Migrating payment methods...
✅ Migrated X payment methods

🖨️  Migrating printers...
✅ Migrated X printers

👥 Migrating users...
✅ Migrated X users

🎨 Migrating colors/theme...
✅ Migrated theme colors

📦 Migrating products...
✅ Migrated X categories and X articles

✨ Migration completed successfully!
```

---

## Table Count Summary

- **Total tables created**: 28
- **Tables with data from Google Sheets**: 8
- **Empty tables ready for use**: 20

---

## Next Steps After Migration

1. **Verify tables exist**: Run `bun run test-db`
2. **Check data**: Connect to your Neon database and verify data
3. **Start using**: Your application can now use all tables
4. **Populate remaining tables**: Use your application to add orders, formulas, etc.

---

## Foreign Key Relationships

The migration creates these foreign key constraints:

### `dc_pos.facturation`
- `user_id` → `users(id)`
- `payment_method_id` → `payment_methods(id)`
- `currency_id` → `currency(id)`

### `dc_pos.facturation_article`
- `facturation_id` → `facturation(id)`

All other relationships are managed at the application level (no FK constraints in the original schema).
