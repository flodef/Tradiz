# Database Structure

This document explains the PostgreSQL database structure used by Tradiz after migration from Google Sheets.

## Overview

The system uses **two separate databases**:
- **`dc`**: Main database for products, categories, and themes
- **`dc_pos`**: POS (Point of Sale) database for transactions, users, and configuration

This structure matches the existing `digi-carte-deploy` schema from `/home/flo/Github/digi-carte-deploy/dc-admin/config/database/db_struct.sql`.

## Database: `dc`

### Tables

#### `categorie`
Product categories with tax rates.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(10) | Primary key (e.g., 'cat1', 'cat2') |
| nom | VARCHAR(50) | Category name |
| ordre | INTEGER | Display order |
| taux_tva_default | DECIMAL(5,2) | Default VAT rate (e.g., 10.00 for 10%) |

**Data Source**: Google Sheets `_Produits` tab (column: Catégorie)

#### `article`
Products/items for sale.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key (auto-increment) |
| ordre | INTEGER | Display order |
| nom | VARCHAR(50) | Product name |
| prix | DECIMAL(8,2) | Price |
| photo | VARCHAR(50) | Photo filename (empty by default) |
| disponible | INTEGER | Availability (1=available, 0=unavailable) |
| categorie | VARCHAR(50) | Foreign key to categorie.id |
| description | VARCHAR(300) | Product description (optional) |
| options | VARCHAR(1000) | Product options (JSON or text) |
| nbr_commandes | INTEGER | Number of orders (default 0) |
| taux_tva | DECIMAL(5,2) | VAT rate for this product |

**Data Source**: Google Sheets `_Produits` tab

**Note**: The `disponible` field is inverted from the sheet - sheet has "Indisponible" (unavailable), database has "disponible" (available).

#### `theme_admin`
UI theme colors for the admin interface.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| selected | INTEGER | Is this theme selected? (1=yes, 0=no) |
| name | VARCHAR(50) | Theme name (e.g., 'Tradiz Theme') |
| text_light | VARCHAR(9) | Text color in light mode |
| text_dark | VARCHAR(9) | Text color in dark mode |
| gradient_start_light | VARCHAR(9) | Gradient start in light mode |
| gradient_start_dark | VARCHAR(9) | Gradient start in dark mode |
| gradient_end_light | VARCHAR(9) | Gradient end in light mode |
| gradient_end_dark | VARCHAR(9) | Gradient end in dark mode |
| popup_light | VARCHAR(9) | Popup color in light mode |
| popup_dark | VARCHAR(9) | Popup color in dark mode |
| activated_light | VARCHAR(9) | Activated state in light mode |
| activated_dark | VARCHAR(9) | Activated state in dark mode |
| secondary_light | VARCHAR(9) | Secondary color in light mode |
| secondary_dark | VARCHAR(9) | Secondary color in dark mode |
| secondary_activated_light | VARCHAR(9) | Secondary activated in light mode |
| secondary_activated_dark | VARCHAR(9) | Secondary activated in dark mode |

**Data Source**: Google Sheets `Couleurs` tab

---

## Database: `dc_pos`

### Tables

#### `currency`
Supported currencies with exchange rates.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| label | VARCHAR(50) | Currency name (e.g., 'Euro') |
| symbol | VARCHAR(5) | Currency symbol (e.g., '€') |
| max_value | DECIMAL(10,4) | Maximum transaction value |
| decimals | INTEGER | Number of decimal places (default 2) |
| rate | DECIMAL(10,4) | Exchange rate (default 1.0000) |
| fee | DECIMAL(3,1) | Transaction fee percentage (default 0.0) |

**Data Source**: Google Sheets `_Monnaies` tab

#### `parameters`
Shop configuration parameters (key-value pairs).

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| param_key | VARCHAR(100) | Parameter key (unique) |
| param_value | VARCHAR(255) | Parameter value |
| updated_at | TIMESTAMP | Last update timestamp |

**Data Source**: Google Sheets `Paramètres` tab

**Parameter Keys**:
- `name`: Shop name
- `address`: Shop address
- `zipCode`: Postal code
- `city`: City
- `serial`: Serial number
- `id`: Shop ID
- `email`: Shop email
- `thanksMessage`: Thank you message
- `mercurial`: Mercurial type
- `closingHour`: Closing hour (0-23)
- `yearStartDate`: Year start date (JSON)
- `lastModified`: Last modification date

#### `payment_methods`
Available payment methods.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| label | VARCHAR(50) | Payment method name (unique) |
| address | VARCHAR(255) | Payment address (for crypto/IBAN) |
| currency | VARCHAR(10) | Currency symbol (default '€') |
| hidden | SMALLINT | Is hidden? (1=yes, 0=no) |
| created_at | TIMESTAMP | Creation timestamp |

**Data Source**: Google Sheets `Paiements` tab

#### `printers`
Network printer configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(100) | Printer name (unique) |
| ip_address | VARCHAR(50) | Printer IP address |
| created_at | TIMESTAMP | Creation timestamp |
| note_enabled | SMALLINT | Enable for note printing (1=yes, 0=no) |

**Data Source**: Google Sheets `Imprimantes` tab

#### `users`
User accounts with roles.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| key | VARCHAR(50) | User's public key (unique identifier) |
| name | VARCHAR(100) | User's display name |
| role | VARCHAR(50) | User role (Cashier, Service, Kitchen, Admin) |
| created_at | TIMESTAMP | Creation timestamp |

**Data Source**: Google Sheets `Utilisateurs` tab

---

## Data Migration Mapping

### Google Sheets → PostgreSQL

| Sheet Tab | Database | Table | Notes |
|-----------|----------|-------|-------|
| `Paramètres` | dc_pos | parameters | Key-value pairs |
| `_Monnaies` | dc_pos | currency | Currency definitions |
| `Paiements` | dc_pos | payment_methods | Payment options |
| `Imprimantes` | dc_pos | printers | Printer configs |
| `Utilisateurs` | dc_pos | users | User accounts |
| `Couleurs` | dc | theme_admin | UI theme colors |
| `_Produits` | dc | categorie + article | Split into categories and products |
| `Remises` | (not migrated) | - | Currently uses JSON fallback |

### Important Notes

1. **Tax Rates**: Converted from decimal (0.1) to percentage (10.00)
2. **Category IDs**: Generated as 'cat1', 'cat2', etc. (VARCHAR, not INTEGER)
3. **Availability**: Inverted from sheet's "Indisponible" to database's "disponible"
4. **Theme Name**: Set to 'Tradiz Theme' by default
5. **Timestamps**: Auto-generated on insert for created_at fields

---

## Connection Configuration

### Environment Variables

```bash
PG_HOST=ep-xxx-xxx.region.aws.neon.tech
PG_USER=neondb_owner
PG_PASSWORD=your_password_here
```

**Note**: No `PG_DATABASE` variable needed - the migration script automatically creates and uses `dc` and `dc_pos` databases.

### Connection in Code

```typescript
// For main database (products, categories, themes)
const dcClient = new Client({ 
    ...pgConfig, 
    database: 'dc' 
});

// For POS database (transactions, users, config)
const dcPosClient = new Client({ 
    ...pgConfig, 
    database: 'dc_pos' 
});
```

---

## Schema Compatibility

This schema is **100% compatible** with the existing `digi-carte-deploy` structure, ensuring:
- Seamless integration with existing tools
- No breaking changes to API endpoints
- Consistent data types and constraints
- Proper foreign key relationships (where applicable)

---

## Future Enhancements

Potential additions (not currently migrated):
1. **Discounts table**: Currently uses JSON fallback
2. **Formulas table**: For meal combos (from digi-carte schema)
3. **Orders/Transactions**: For sales tracking
4. **Statistics**: For reporting and analytics

These can be added later without affecting the current migration.
