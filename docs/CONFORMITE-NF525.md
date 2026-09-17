# Conformité NF525 — Documentation technique

## Avertissement

Tradiz **n'est pas certifié NF525** par un organisme accrédité (LNE, AFNOR ou autre).
Le présent document décrit les mécanismes techniques implémentés pour satisfaire aux
conditions prévues au 3° bis du I de l'article 286 du CGI, dans le cadre d'une
**auto-attestation de l'éditeur**.

L'auto-attestation est une déclaration unilatérale de l'éditeur. La responsabilité
juridique repose entièrement sur l'éditeur et sur l'exploitant qui déploie le logiciel.
Ce document ne constitue pas un certificat NF525.

## Conditions ISCA et mécanismes implémentés

### 1. Inaltérabilité

**Mécanisme :** Hachage chaîné SHA-256 sur les transactions et les événements d'audit.

- Chaque transaction possède un `hash` (SHA-256) et un `previous_hash` qui relie
  à la transaction précédente, formant une chaîne immuable.
- Le hachage inclut : `previous_hash`, `transaction_id`, `order_id`, `user_name`,
  `payment_method`, `amount`, `currency`, `created_at`, `change`, `device_id`,
  et un **digest canonique des lignes de transaction** (label, quantité, prix unitaire,
  total, taux de TVA, remise).
- Les événements d'audit (`audit_events`) sont également chaînés avec
  `event_hash` et `previous_event_hash`, et incluent `created_at` dans le hachage
  pour empêcher l'antidatage.
- Les suppressions de transactions sont des **suppressions logiques** : la ligne
  est marquée `payment_method = 'SUPPRIMÉE'` et un événement d'audit est enregistré.
- Avant chaque remplacement de lignes de transaction lors d'une synchronisation,
  un événement d'audit `transaction_items_replaced` capture l'ensemble des articles
  précédents, laissant une trace même après la suppression physique des lignes.
- Les hachages de clôture sont **ancrés à la chaîne des transactions** : le
  hachage d'une clôture journalière inclut le premier et le dernier hachage de
  transaction payée du jour ; les clôtures mensuelles et annuelles incluent de
  même le premier et le dernier hachage des clôtures de la période inférieure.
  Toute modification d'une transaction ou d'une clôture scellée invalide donc le
  hachage de la clôture correspondante.
- **Journée scellée** : `saveTransaction` refuse (HTTP 409 `DAY_CLOSED`) toute
  écriture qui casserait le sceau — mutation d'une ligne dont le jour (ou un
  jour ultérieur) est clôturé, puisque le rechaînage réécrit les hachages en
  aval ; ou insertion datée d'un jour clôturé, qui falsifierait les totaux
  scellés. Une correction après clôture s'écrit comme **nouvelle transaction
  datée du jour ouvert** (avoir/remboursement). Les brouillons
  (`EN COURS`/`EN ATTENTE`/`EN MODIF`) d'un jour clôturé, devenus
  in finalisables, sont exclus de la synchronisation (conservés en base pour
  la traçabilité). Côté client, la finalisation tardive d'un panier daté d'un
  jour clôturé est automatiquement redatée au jour courant en nouvelle
  transaction — la ligne scellée reste intacte. La règle s'applique aussi à
  l'échelon supérieur : une clôture journalière est refusée dans un mois ou
  une année déjà clôturés, et une clôture mensuelle dans une année clôturée
  (les ancres de période couvrent les hachages des clôtures enfants). Un sceau
  ne peut porter que sur une période entièrement écoulée : une clôture
  mensuelle/annuelle de la période en cours (ou une clôture journalière datée
  dans le futur) est une donnée incohérente ignorée par les garde-fous, et sa
  création est refusée. Les
  lectures d'ancres et de totaux sont sérialisées avec les écritures du
  niveau inférieur via des verrous consultatifs
  (`nf525_transactions < nf525_daily_closures < nf525_period_closures`), pour
  qu'aucune vente ni clôture enfant ne puisse se glisser entre le calcul des
  ancres et l'insertion.
- **Clôture automatique** : le paramètre `closingHour` déclenche, à chaque
  passage de l'heure configurée (y compris après une période hors tension),
  la clôture de tous les jours calendaires ouverts jusqu'à la veille de la
  borne. En mode automatique (`auto: true`), les brouillons datés du jour
  clôturé ou avant sont **redatés au jour ouvert** plutôt que supprimés —
  le panier reste vivant sur l'autre caisse, le déplacement est tracé par
  un événement d'audit `transaction_redated` et la chaîne de hachage est
  recalculée (`rechainFrom`). Une clôture manuelle est au contraire refusée
  tant qu'un brouillon existe ce jour-là (HTTP 409 `PENDING_DRAFTS`) — le
  caissier doit l'encaisser ou l'annuler.
- **Protection base de données** : des triggers `BEFORE UPDATE/DELETE`
  (et `BEFORE TRUNCATE` sur `transactions`/`audit_events`) rendent les
  tables fiscales append-only pour tout rôle, y compris le propriétaire.
  Appliqués sur les bases hébergées via
  `scripts/harden-nf525-triggers-postgres.sql` ; le script complet
  `scripts/harden-nf525-postgres.sql` ajoute le rôle applicatif restreint
  `tradiz_app` pour les installations auto-hébergées. Une réparation
  légitime passe par `ALTER TABLE <t> DISABLE TRIGGER ALL` (rôle owner).

**Limites connues :**

- Lors des synchronisations, les lignes de transactions ne sont réécrites
  (suppression puis réinsertion) que lorsqu'elles ont réellement changé ;
  l'événement d'audit `transaction_items_replaced` conserve alors l'état
  antérieur.
- Sur une installation auto-hébergée n'ayant pas appliqué les scripts de
  durcissement, un administrateur de la base peut modifier directement les
  tables fiscales — ce qui resterait détectable par la vérification
  d'intégrité.

### 2. Sécurisation

**Mécanisme :** Journalisation des opérations sensibles dans `audit_events`.

- Toute opération sensible (suppression, modification, clôture, export d'archive,
  changement de paramètres, changement d'articles/tarifs/TVA/moyens de paiement/
  utilisateurs/remises/catégories) est tracée avec :
    - `event_type` (type d'opération)
    - `entity_type` et `entity_id` (entité concernée)
    - `user_name` (opérateur)
    - `device_id` (caisse)
    - `detail` (détail JSON de l'opération)
    - `created_at` (horodatage, inclus dans le hachage)
- Les événements d'audit sont chaînés par hachage SHA-256.
- Les changements de prix et de taux de TVA des articles sont en outre
  historisés dans `product_price_history` (référence, nom, ancienne et
  nouvelle valeur de prix/TVA, opérateur, horodatage).

### 3. Conservation

**Mécanisme :** Les données fiscales sont conservées dans la base de données de l'exploitant.

- Transactions (en-têtes + lignes)
- Clôtures journalières, mensuelles, annuelles
- Événements d'audit
- Totaux perpétuels
- Export d'archive fiscale disponible via `/api/sql/fiscalArchive`

**Responsabilité de l'exploitant :** La durée de conservation, les sauvegardes,
et l'accès à la base de données relèvent de la responsabilité de l'exploitant.

### 4. Archivage

**Mécanisme :** Export d'archive fiscale signé par HMAC-SHA256.

- L'endpoint `/api/sql/fiscalArchive` produit un export JSON contenant :
    - Transactions et leurs lignes
    - Clôtures journalières, mensuelles, annuelles
    - Totaux perpétuels
    - Événements d'audit
    - Métadonnées (logiciel, version, période)
    - Signature HMAC-SHA256 (si `FISCAL_ARCHIVE_HMAC_KEY` est configuré)
- Le script `scripts/verify-archive.ts` permet à un tiers de vérifier la signature.

## Vérification de l'intégrité

### Endpoint

`GET /api/sql/verifyIntegrity`

Vérifie l'intégrité de **toutes les chaînes** :

1. **Chaîne des transactions** — vérifie `previous_hash` et recompute le hash
   (incluant les lignes de transaction)
2. **Chaîne des clôtures journalières** — vérifie `previous_closure_hash` et recompute
3. **Chaîne des clôtures mensuelles** — vérifie `previous_closure_hash` et recompute
4. **Chaîne des clôtures annuelles** — vérifie `previous_closure_hash` et recompute
5. **Chaîne des événements d'audit** — vérifie `previous_event_hash` et recompute

### Réponse

```json
{
    "integrity_ok": true,
    "total_transactions": 12345,
    "verified": 12345,
    "issues_found": 0,
    "chains": {
        "transactions": { "total": 12345, "verified": 12345, "issues_found": 0, "integrity_ok": true },
        "daily_closures": { "total": 365, "verified": 365, "issues_found": 0, "integrity_ok": true },
        "monthly_closures": { "total": 12, "verified": 12, "issues_found": 0, "integrity_ok": true },
        "annual_closures": { "total": 1, "verified": 1, "issues_found": 0, "integrity_ok": true },
        "audit_events": { "total": 5000, "verified": 5000, "issues_found": 0, "integrity_ok": true }
    }
}
```

### Script de vérification

`bun run scripts/verify-integrity.ts` — vérifie l'intégrité depuis la ligne de commande.

## Attestation

L'attestation individuelle de l'éditeur est disponible via :

- **UI :** Section `NF525 — Conformité fiscale` dans les paramètres d'administration.
    - Bouton vert "Valide" si une attestation signée est présente.
    - Bouton rouge "À signer" sinon. Cliquez pour générer le PDF non signé,
      l'imprimer, le signer, puis importer la version signée.
- **API :** `GET /api/sql/attestation` — statut, `?action=view` — PDF signé,
  `?action=generate` — PDF non signé, `POST` — importer un PDF signé,
  `DELETE` — supprimer l'attestation signée.

Le PDF d'attestation suit le modèle BOI-LETTRE-000242 avec deux volets :

1. **Volet éditeur** — rempli par le représentant légal de l'éditeur du logiciel.
2. **Volet utilisateur** — rempli par le représentant légal de l'entreprise utilisatrice.

## Scripts de migration et de réparation

### `scripts/generate-transaction-hashes.ts`

Génère les hachages chaînés pour les transactions existantes.

**⚠️ Garde :** Si des hachages existent déjà, le script refuse de s'exécuter
sans l'option `--force-rechain`. Une confirmation tapée ("RECHAIN") est requise,
et un événement d'audit `chain_rebuild` est enregistré avec le hash de tête
précédent, le nombre de lignes, et l'opérateur.

Ce script ne doit **pas** être utilisé pour "réparer" une chaîne en production.
Il sert uniquement au bootstrap initial de données pré-NF525.

### `scripts/populate-nf525-tables.ts`

Remplit les tables de clôtures à partir des transactions existantes.

Même garde que `generate-transaction-hashes.ts` : refuse d'écraser des données
existantes sans `--force-rechain` + confirmation + audit.

## Versioning

Les changements impactant la conformité fiscale (format de hachage, logique de
clôture, calcul de TVA, format d'archive) doivent être documentés dans le
CHANGELOG.md et identifiés comme tel.

Le numéro de version du logiciel est affiché sur les reçus et dans l'attestation.
