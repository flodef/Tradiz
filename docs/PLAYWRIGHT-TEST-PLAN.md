# Playwright E2E Test Plan — Tradiz POS

## Overview

This document describes the E2E test strategy for the Tradiz cash register application
using [Playwright](https://playwright.dev). The app is a Next.js App Router project
running at `localhost:3000` (dev) with bun as the package manager.

## Test Environment

- **Base URL**: `http://localhost:3000` (dev server, already running in background)
- **Browser**: Chromium (primary), Firefox (secondary)
- **Auth**: The app uses a `publicKey` query param or localStorage for device identification.
  Tests will use a mock/demo key to bypass the config loading state.
- **Data**: Tests should run against the dev environment with `IS_DEV=true` to avoid
  fullscreen enforcement and allow localhost access without Electron.

## Test Categories

### 1. Cash Register — Product Selection (`/`)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Category bar renders | Navigate to `/`, wait for load | Category buttons visible at bottom |
| 1.2 | Click category opens product popup | Click a category button | Popup appears with product list |
| 1.3 | Select product adds to basket | Click a product in popup | Product appears in Total list, popup closes |
| 1.4 | Product with options shows sub-popup | Click product with options (▸ indicator) | Options sub-popup appears instead of direct add |
| 1.5 | "Autres" button adds free-price item | Long-press / right-click category | Adds "Autres" product with current numpad amount |
| 1.6 | Catalog mode grid renders | If catalogMode enabled | 6×6 product grid with category bar |
| 1.7 | Category scroll arrows | When categories overflow | Left/right scroll arrows appear and work |

### 2. NumPad — Quantity & Amount Entry

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | Numeric input updates amount | Type digits on numpad | Amount display updates |
| 2.2 | Quantity halving (½, ¼) | Select product, press ½ | Quantity becomes 0.5, then 0.25 |
| 2.3 | Backspace clears last digit | Type amount, press backspace | Last digit removed |
| 2.4 | Calculator mode | Open calculator icon | Calculator popup appears |
| 2.5 | Barcode scanner input | Simulate barcode input | Matching product added to basket |

### 3. Total — Basket & Transaction List

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | Basket displays added products | Add 2+ products | Products listed with prices |
| 3.2 | Total updates on add | Add products | Total amount updates correctly |
| 3.3 | Product quantity edit | Long-press product in list | Edit popup appears |
| 3.4 | Remove product from basket | Use edit popup to remove | Product removed, total updates |
| 3.5 | Discount application | Apply discount to product | Discounted price shown |
| 3.6 | Clear basket | Press clear button | All products removed |
| 3.7 | Transaction list shows completed sales | Complete a payment | Transaction appears in list |

### 4. Payment Flow

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | Payment popup opens | Add products, click "Encaisser" | Payment method popup appears |
| 4.2 | Single payment — Carte Bancaire | Select "Carte Bancaire" | Transaction committed, success popup |
| 4.3 | Cash payment with change | Select "Espèces", enter cash amount | Change display popup, transaction committed |
| 4.4 | Cash payment — exact amount | Enter exact total | Transaction committed, no change popup |
| 4.5 | Multi-payment (MULTIPLE) | Select "MULTIPLE", enter 2+ legs | Each leg shown, remaining balance updates, commit works |
| 4.6 | Split payment — even | Select "PARTAGER" → "Partage égal" | Split popup, total divided evenly |
| 4.7 | Split payment — round-robin | Select "PARTAGER" → "Tour à tour" | Products distributed across splits |
| 4.8 | Split payment — item-pick | Select "PARTAGER" → "Chacun ses articles" | Product picker appears |
| 4.9 | Print receipt (with/without details) | Select "Impression (avec/sans détail)" | Kitchen receipt printed, transaction on hold |
| 4.10 | Put on hold (EN ATTENTE) | Select "METTRE EN ATTENTE" | Transaction saved as waiting |
| 4.11 | Refund flow | Select "REMBOURSEMENT" | Refund confirmation popup, reversed transaction |
| 4.12 | Debit (customer credit) | Select "DEBIT", pick customer | Customer balance debited |
| 4.13 | Provision (customer top-up) | Select "PROVISION", pick customer, amount | Balance topped up |
| 4.14 | Fidelity discount | Select "UTILISER FIDÉLITÉ" | Fidelity discount applied |
| 4.15 | Virement (bank transfer) | Select "Virement" | IBAN popup, then commit |

### 5. Customer Display (VFD)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Idle display | No products in basket | Shop name shown on VFD |
| 5.2 | Transaction display | Add product | Product name + total on VFD |
| 5.3 | Payment display | Open payment popup | Payment method + amount on VFD |
| 5.4 | Change display | Complete cash payment with change | Change amount held on VFD |
| 5.5 | Multi-payment display | Open multi-payment popup | "Paiement multiple" + remaining balance |

### 6. Summary / Z Ticket

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | Open summary | Click summary button | Summary popup with totals |
| 6.2 | Payment method breakdown | View summary | Each payment method listed with count + amount |
| 6.3 | Multi-payment expansion | Complete multi-payment, view summary | Individual legs shown, not "MULTIPLE" |
| 6.4 | Category breakdown | View summary | Product categories listed with quantities |
| 6.5 | Print Z ticket | Click print in summary | Z ticket sent to printer |
| 6.6 | Export summary (Excel) | Click export | XLSX file downloaded |
| 6.7 | Email summary | Click email | Email sent (mock) |

### 7. Admin — Configuration (`/admin/kitchen/config`)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | Config page loads | Navigate to `/admin/kitchen/config` | All config sections visible |
| 7.2 | Products section | Expand products section | Product list with editable fields |
| 7.3 | Add product | Click add, fill fields, save | New product appears in list |
| 7.4 | Edit product | Edit existing product, save | Changes persisted |
| 7.5 | Categories section | Expand categories | Category list with sort order |
| 7.6 | Payment methods section | Expand payments | Payment methods with availability toggles |
| 7.7 | Currencies section | Expand currencies | Currency list with labels and decimals |
| 7.8 | Printers config | Expand printers | Printer list with roles and addresses |
| 7.9 | Parameters section | Expand parameters | Shop info, display settings, fidelity |
| 7.10 | Users section | Expand users | User list with roles |
| 7.11 | Customers section | Expand customers | Customer list with details |
| 7.12 | Companies section | Expand companies | Company list with SIRET, VAT, address |
| 7.13 | Discounts section | Expand discounts | Discount list |
| 7.14 | Colors section | Expand colors | Color palette config |
| 7.15 | Devices section | Expand devices | Device list with hardware config |
| 7.16 | Save config | Make changes, click save | Success confirmation |
| 7.17 | Unsaved changes warning | Make changes, navigate away | Confirmation popup |

### 8. Admin — Menu Editor (`/admin/edit_menu`)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | Menu editor loads | Navigate to `/admin/edit_menu` | Product grid/table visible |
| 8.2 | Edit product price | Change price field | Value updated |
| 8.3 | Add new product | Click add, fill form | Product added to list |
| 8.4 | Delete product | Click delete on product | Product removed |
| 8.5 | Catalog editor mode | Toggle catalog mode | Grid-based catalog editor appears |
| 8.6 | Drag-and-drop sort | Drag product to new position | Sort order updated |
| 8.7 | Formula editor | Create/edit formula | Formula elements configurable |
| 8.8 | Options editor | Create/edit options | Option groups configurable |

### 9. Stats / Billing (`/stats`)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | Stats page loads | Navigate to `/stats` | Dashboard visible |
| 9.2 | Date range filter | Select date range | Stats update |
| 9.3 | Billing report | Navigate to billing | Customer billing list |
| 9.4 | Factur-X PDF | Click "Factur-X PDF" | PDF downloaded |
| 9.5 | PennyLane push | Click "Envoyer PennyLane" | Invoice pushed (mock) |

### 10. Kitchen View (if `USE_DIGICARTE`)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 10.1 | Kitchen orders display | Navigate to kitchen view | Pending orders visible |
| 10.2 | Order status change | Mark order as ready | Status updated |
| 10.3 | Order sent to cashier | Click send to cashier | Message posted to parent |

### 11. Offline / Sync

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 11.1 | Offline banner | Simulate network failure | Offline banner appears |
| 11.2 | Transaction sync on reconnect | Go offline, add transaction, reconnect | Transaction synced |
| 11.3 | Day reset | Trigger day reset | Transactions cleared, Z ticket generated |

### 12. Error States

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 12.1 | Config load error | Simulate config fetch failure | Error popup with retry |
| 12.2 | Unidentified user | Invalid publicKey | Access request popup |
| 12.3 | Missing data | Empty inventory | Missing data popup |

## Implementation Priority

### Phase 1 — Core POS Flow (highest value)
- Tests 1.1–1.3, 2.1–2.3, 3.1–3.2, 4.1–4.5
- These cover the primary user journey: select products → enter amount → pay

### Phase 2 — Payment Methods
- Tests 4.6–4.15, 5.1–5.5, 6.1–6.3
- All payment methods, customer display, and summary integration

### Phase 3 — Admin Configuration
- Tests 7.1–7.17, 8.1–8.8
- Configuration and menu editing

### Phase 4 — Stats & Edge Cases
- Tests 9.1–9.5, 10.1–10.3, 11.1–11.3, 12.1–12.3
- Stats, kitchen, offline, and error handling

## Technical Notes

- Playwright config should extend Next.js's experimental testmode for API mocking.
- Tests need a setup step to seed `localStorage` with a valid config to bypass
  the ConfigProvider's async fetch (or mock the `/api/sql/getConfig` endpoint).
- The app uses `postMessage` for customer display and parent window communication —
  tests should intercept these or use `page.evaluate` to verify.
- Electron-specific code paths (`window.electronAPI`) should be mocked or skipped.
- The dev server is already running — tests should connect to it rather than
  starting a new one.
