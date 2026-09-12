# Configuration Revolut — Paiement en ligne

## Variables d'environnement Vercel

Dashboard Vercel → Projet **tradiz** → Settings → Environment Variables :

| Variable | Description | Exemple |
|---|---|---|
| `REVOLUT_SECRET_KEY` | Clé secrète merchant Revolut | `sk_live_...` ou `sk_test_...` |
| `REVOLUT_MODE` | Mode sandbox ou production | `sandbox` ou `prod` |
| `NEXT_PUBLIC_APP_URL` | URL publique (pour redirect après paiement) | `https://tradiz.fr` |

## Étapes pour activer Revolut

### 1. Créer un compte Revolut Business

1. Aller sur https://business.revolut.com
2. Créer un compte business (si pas déjà fait)
3. Vérifier l'identité et compléter le KYC

### 2. Activer l'API Merchant

1. Dashboard Revolut Business → **Merchant** (ou **Accept Payments**)
2. Activer l'API Merchant
3. Aller dans **API Keys** (ou Settings → API Keys)

### 3. Récupérer les clés API

1. Créer une nouvelle clé API
2. Copier la **Secret Key** (commence par `sk_`)
3. Noter le mode :
   - **Sandbox** : `sk_test_...` + `REVOLUT_MODE=sandbox`
   - **Production** : `sk_live_...` + `REVOLUT_MODE=prod`

### 4. Configurer dans Vercel

1. Dashboard Vercel → Projet **tradiz** → Settings → Environment Variables
2. Ajouter :
   - `REVOLUT_SECRET_KEY` = ta clé secrète
   - `REVOLUT_MODE` = `sandbox` (pour tester) ou `prod` (pour la production)
   - `NEXT_PUBLIC_APP_URL` = `https://tradiz.fr`
3. Redéployer le projet (Deployments → Redeploy)

### 5. Tester le paiement

1. Aller sur `https://tradiz.fr/landing#tarifs`
2. Cliquer sur "Choisir [forfait]"
3. La page `/checkout` s'ouvre avec le widget Revolut
4. En mode sandbox, utiliser les cartes de test Revolut :
   - Carte réussie : `4111 1111 1111 1111`
   - Carte refusée : `4000 0000 0000 0002`
   - Date : n'importe quelle date future
   - CVC : n'importe quel code à 3 chiffres

### 6. Passer en production

1. Dans Revolut Business, passer du mode sandbox au mode live
2. Récupérer la clé de production (`sk_live_...`)
3. Dans Vercel, mettre à jour :
   - `REVOLUT_SECRET_KEY` = clé de production
   - `REVOLUT_MODE` = `prod`
4. Redéployer

## Fichiers concernés

- `src/app/api/create-order/route.ts` — API route qui crée la commande Revolut
- `src/app/checkout/page.tsx` — Page de checkout avec widget Revolut
- `src/app/landing/page.tsx` — Section tarifs avec liens vers `/checkout`

## Forfaits

| Forfait | Mensuel | Annuel (2 mois offerts) |
|---|---|---|
| Découverte | 30€ | 300€ |
| Pro | 50€ | 500€ |
| Privilège | 100€ | 1000€ |
