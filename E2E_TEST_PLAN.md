# End-to-End Test Plan

This document provides a comprehensive test scenario for validating the main app (cashier register) and admin section before production launch.

---

## Main App (Cashier Register) - Critical Path

### 1. Load Cashier Register
- [ ] Open the app and verify all products display correctly
- [ ] Check that categories are organized by order
- [ ] Verify products with `stock=0` are hidden
- [ ] Verify products with `stock=null` are visible
- [ ] Verify loading state shows LoadingDot (not spinner)

### 2. Add Products to Cart
- [ ] Select products from different categories
- [ ] Verify total calculation is correct
- [ ] Add multiple quantities of the same product
- [ ] Test currency switching and verify correct currency used
- [ ] Verify discount application if applicable

### 3. Complete Payment Transaction
- [ ] Choose a payment method (Espèces, CB, etc.)
- [ ] Complete the transaction
- [ ] Verify it saves to PostgreSQL
- [ ] Check DB: `SELECT * FROM dc_pos.transactions ORDER BY created_at DESC LIMIT 1;`
- [ ] Verify `createdDate` is second-precision (no milliseconds)
- [ ] Verify `transaction_items` table has correct products

### 4. Edit Existing Transaction
- [ ] Go to transaction history
- [ ] Edit a transaction (add/remove products)
- [ ] Save changes
- [ ] Verify DB update reflects the changes
- [ ] Verify `transaction_items` table is updated correctly

### 5. Delete Transaction
- [ ] Delete a transaction from history
- [ ] Verify `payment_method` = `EFFACÉE` in DB
- [ ] Verify it doesn't appear in cashier UI
- [ ] Check DB: `SELECT payment_method FROM dc_pos.transactions WHERE payment_method = 'EFFACÉE';`

### 6. EN ATTENTE (Waiting) Transaction
- [ ] Create a transaction with `EN ATTENTE` method
- [ ] Verify it syncs to PostgreSQL
- [ ] Verify it appears in transaction list
- [ ] Convert to real payment
- [ ] Verify update reflects in DB

### 7. Refresh Persistence
- [ ] Create several transactions
- [ ] Refresh the page (hard refresh: Ctrl+Shift+R)
- [ ] Verify all transactions reload from PostgreSQL
- [ ] Verify no duplicates (precision test)
- [ ] Verify `createdDate` values match between UI and DB

---

## Admin Section - Critical Path

### 8. Admin Authentication
- [ ] Access admin panel at `/admin`
- [ ] Verify authentication works
- [ ] Verify role-based access control (admin vs cashier)

### 9. Product Management
- [ ] Navigate to Products config page
- [ ] Add a new product (name, price, category, stock)
- [ ] Verify it appears in cashier immediately
- [ ] Edit product price/stock
- [ ] Verify changes reflect in cashier
- [ ] Delete a product
- [ ] Verify it's removed from cashier
- [ ] Check DB: `SELECT * FROM dc.products ORDER BY sort_order DESC LIMIT 5;`

### 10. Category Management
- [ ] Navigate to Categories config page
- [ ] Create a new category
- [ ] Verify it appears in cashier
- [ ] Edit category order
- [ ] Verify reordering reflects
- [ ] Delete category (with products moved or deleted)

### 11. Configuration Pages
- [ ] Update shop parameters (name, address, email, etc.)
- [ ] Verify changes appear in cashier
- [ ] Configure payment methods
- [ ] Verify options appear in cashier
- [ ] Configure currencies
- [ ] Verify availability in cashier
- [ ] Configure discounts
- [ ] Verify discount calculation works

### 12. Statistics Page
- [ ] Access statistics at `/stats`
- [ ] Verify daily sales display
- [ ] Verify transactions from cashier appear
- [ ] Verify deleted transactions don't appear
- [ ] Verify no errors in console

### 13. Establishment Config
- [ ] Test kitchen view toggle
- [ ] Verify kitchen service calls are skipped when disabled
- [ ] Test grafana access toggle
- [ ] Verify behavior

---

## Cross-System Integration

### 14. Real-Time Sync
- [ ] Create transaction in cashier
- [ ] Immediately check admin stats
- [ ] Verify transaction appears

### 15. Product Changes Propagation
- [ ] Admin edits product price
- [ ] Immediately check cashier
- [ ] Verify new price is used

### 16. Concurrent Edits
- [ ] Have admin edit a product while cashier is open
- [ ] Verify cashier picks up changes on next interaction

---

## Edge Cases

### 17. Offline Mode
- [ ] Disable network (disconnect internet)
- [ ] Create transaction
- [ ] Verify it saves to IndexedDB (check localStorage)
- [ ] Re-enable network
- [ ] Verify sync pushes to PostgreSQL
- [ ] Check DB for the transaction

### 18. Stock Edge Cases
- [ ] Set product stock to 0 → verify hidden in cashier
- [ ] Set product stock to null → verify visible (unlimited)
- [ ] Set product stock to positive number → verify visible

### 19. Deleted Transaction Cleanup
- [ ] Delete a transaction
- [ ] Verify it doesn't appear in stats
- [ ] Verify it doesn't appear in cashier history

### 20. Performance
- [ ] Verify page load times < 3s
- [ ] Verify sync completes in reasonable time
- [ ] Verify no blocking UI during sync

---

## Database Verification (Manual Checks)

After each critical operation, verify PostgreSQL directly:

```sql
-- Check transactions
SELECT id, order_id, payment_method, amount, created_at, updated_at 
FROM dc_pos.transactions 
ORDER BY created_at DESC LIMIT 5;

-- Check transaction items
SELECT ti.transaction_id, ti.label, ti.quantity, ti.total 
FROM dc_pos.transaction_items ti 
JOIN dc_pos.transactions t ON ti.transaction_id = t.id 
ORDER BY t.created_at DESC LIMIT 5;

-- Check parameters
SELECT param_key, param_value FROM dc_pos.parameters;

-- Check products
SELECT label, category, price, stock FROM dc.products ORDER BY sort_order;
```

---

## Browser Console Checks

While testing, monitor the browser console for:
- [ ] No `MissingDataError` errors
- [ ] No `WrongDataPatternError` errors
- [ ] No `counter-order` errors (kitchen service should be skipped when disabled)
- [ ] No network errors for API calls
- [ ] No TypeScript errors

---

## Server-Side Log Checks

Monitor the `bun dev` terminal for:
- [ ] No database connection errors
- [ ] No Neon query errors
- [ ] No 500 errors from API routes
- [ ] Sync operations complete successfully

---

## Success Criteria

All tests must pass before production launch:

- [ ] All cashier operations work correctly
- [ ] All admin operations work correctly
- [ ] Data syncs correctly between IndexedDB and PostgreSQL
- [ ] No duplicates in transaction lists
- [ ] No console errors
- [ ] No server-side errors
- [ ] Performance is acceptable

---

## Notes

- Use a test shop ID (e.g., `annette`) for testing
- Keep a record of any failures with specific error messages
- Test in both light and dark modes
- Test on different screen sizes (mobile, tablet, desktop)
