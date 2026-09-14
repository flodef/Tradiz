# Plan d'implémentation — suivi

> État vérifié dans le code (branche `dev`). ✅ fait · 🟡 partiel · ⬜ non fait

## Phase 1 : Système financier (fondation)

- ✅ **TVA** — `vat_rate` par produit, ventilation multi-TVA sur les lignes de transaction, taux par défaut appliqué (`updateArticles`, reçus, attestation NF525)
- ✅ **Moyens de paiement** — CB, espèces, chèque, provision, titres-resto (employer share), multi-paiement, paiement fractionné
- ✅ **Comptes clients (crédit/débit)** — `customers.balance`, historique `balance_history`, méthode DEBIT
- ✅ **Suivi des balances** — impression du solde, endpoint de consultation, `CustomerListReport`

## Phase 2 : Multi-sociétés & facturation

- ✅ **Quote part employeur** — `employer_share` par produit, réservé Privilège (testé)
- ✅ **Facturation mensuelle** — entreprises (`companies`), `nextInvoiceNumber`, génération de factures, `getBillingReport`, export Factur-X, push Pennylane
- ✅ **Rapports mensuels** — `getBillingReport` + impression/PDF

## Phase 3 : Gestion & recherche clients

- ✅ **CRUD clients** — `updateCustomers` / `addCustomer`, validation (noms, email, téléphone FR), références auto
- ✅ **Recherche client** — `SearchPopup` (produits + clients + users) intégré au numpad et au flux de paiement

## Phase 4 : Flux de paiement & monnaie

- ✅ **Rendu monnaie** — saisie du montant espèces, calcul du rendu (`{"cashAmount","change"}`), affichage sur ticket + écran client (E2E : "Cash payment with change")

## Phase 5 : Impression employés

- ✅ **Liste employés** — `EmployeeListReport` avec nom + référence + code-barres, génération PDF/impression (`barcode.test.ts`)

## Phase 6 : Infrastructure & packaging

- ✅ **Installeur Windows** — Electron (`electron-builder.yml`, `electron/`, `SETUP.md`), dist scripts `electron:dist:*`
- ✅ **Pilotes/intégrations** — ports COM (`list-com-ports`), tiroir-caisse (`open-cash-drawer`), imprimantes thermiques, scanner codes-barres
- ✅ **Mini écran client** — affichage via port série + page `/mini` + `test-display`

## Phase 7 : UI grands écrans

- ✅ **Mode catalogue (tuiles)** — `catalogMode` : grille de produits en ligne sur grand écran, positions `gridPosition` 0–35, fallback liste sur mobile (`Category.tsx`)
- ✅ **Interface admin** — pages `/admin/*` complètes (config, édition menu, stats Grafana)

## Phase 8 : Commande web (iPad)

- 🟡 **Site public** — catalogue en ligne `/site/[shopId]` (horaires, avis, contact, réservation par téléphone/email via `reservationPhone`/`reservationEmail`)
- ⬜ **Prise de commande web** — pas de panier/commande en ligne côté site ; il n'existe que le comptoir interne (`counter-order` → affichage cuisine) et le tunnel de paiement abonnement (`checkout`, Revolut)
- ⬜ **Impression Epson depuis le web** — non implémentée pour les commandes web

## Post-plan (ajouté depuis)

- Abonnements : 3 formules (Découverte/Pro/Privilège), limites serveur + UI, lecture seule si arrêté, quota 3 changements/jour — testé (`__tests__/subscriptionEnforcement.test.ts`, `e2e/06-subscription.spec.ts`)
- Auth niveau 0 par clé device (`docs/AUTHENTICATION.md`, roadmap niveau 3)
- Conformité NF525 : chaîne de hash, attestation, archive fiscale, verrouillage post-clôture
- Démo : seed + reset (script + route `/api/sql/resetDemo` + landing), transactions générées chaînées
