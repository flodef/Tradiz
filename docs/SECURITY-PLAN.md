# Plan Sécurité — état d'avancement et suite

Suivi de la Phase A (adaptée de job-conciergerie) et recommandations pour un
système d'accès robuste. Légende : ✅ fait · 🟡 partiel · ⬜ à faire

---

## Phase A — Lockdown (FAIT)

Objectif : fermer les trous sans changer le comportement visible pour les
utilisateurs actuels. **Livrable atteint** : app identique pour les
utilisateurs enregistrés, DB plus lisible anonymement.

### A.1 — IDs cryptographiquement sûrs ✅

- `generateSecureId()` dans `src/app/utils/id.ts` : `crypto.getRandomValues()`,
  128 bits, hex 32 chars — utilisé pour toutes les **nouvelles** clés device
  (`getPublicKey` dans `processData.ts`).
- `generateSimpleId()` (`Math.random`) conservé en `@deprecated` — les IDs
  existants restent valides, aucune rotation forcée.
- Tests : format, unicité (5000), non-corrélation.

### A.2 — Vérification côté serveur ✅

Le modèle Tradiz ≠ job-conciergerie (pas de cookie `user_id`) : gate par
**clé device** via `assertDeviceAuthorized` (`src/app/api/sql/deviceAuth.ts`)
qui résout device → utilisateur lié → rôle.

- ✅ **45 routes gatées** : 35 `/api/sql/*` (lectures POS + mutations) + 10
  hors-sql (`open-cash-drawer`, `tpe-payment`, `counter-order`,
  `complete-order`, `scan-printers`, `list-com-ports`, `test-display`,
  `local-ip`, `spreadsheet`, `facturx/generate`, `pennylane/push`).
- ✅ Niveaux : `['admin']` pour gestion (`update*`, `getDevices`,
  `getFailedLoginKey`, `getReviews`, `deleteReview`, `auditEvents`,
  `verifyIntegrity`) ; tout appareil enregistré pour le reste.
- ✅ `clearLogs` assoupli à tout device (cleanup Electron auto-scopé par clé).
- ✅ **Anonymes légitimes préservés** : bootstrap (`resolveUser`, `whoami`,
  `getDbConfig`), lookups auto-scopés (`getDeviceHardware`, `heartbeat`),
  `resetDemo` (host démo), site public (`/api/public/*`, `create-order`,
  `revolut-config`, `version`, `shop-id`).
- ✅ Client : tous les `fetch('/api/…')` POS → `deviceFetch` (header
  `x-public-key`) ; `deviceFetchIfKnown` pour les appels montés aussi sur
  pages publiques (`VersionChecker` dans le layout racine — ne minte jamais
  de clé pour un visiteur anonyme).
- ✅ Electron : `getDevices` (admin-gaté, appelé sans clé → bug existant)
  remplacé par `getDeviceHardware` auto-scopé ; `x-public-key` sur
  `addLog`/`clearLogs`.
- ✅ `scripts/export-shop-data.ts` : `DEVICE_PUBLIC_KEY` env var.
- ✅ 14 tests `deviceAuth.test.ts` : 403 sans clé / clé inconnue,
  auto-registration démo, rôles.

### A.3 — Webhook Revolut : N/A ✅

Aucune route webhook dans Tradiz — seul `create-order` (appel **sortant**,
prix côté serveur, public par design). Rien à signer.

### A.4 — Durcissements optionnels : à arbitrer ⬜

| Option | Effort | Recommandation |
|---|---|---|
| Hasher `public_key` en DB (sha256) | Moyen — migration irréversible, toutes les routes comparent des hashes | Reporter (voir Phase B.2) |
| Rotation/expiration des clés | Moyen — UX de renouvellement à inventer | Reporter |
| Rate limiting routes sensibles | Faible — `resolveUser` a déjà un 429 | Phase B.1 |

---

## Ce qui reste — recommandations

### Phase B — Durcissement court terme (faible risque) ⬜

- **B.1 Rate limiting généralisé** — `resolveUser` limite déjà (429). Étendre
  le même compteur (`dc_sys.connections`) à `whoami`, `getDeviceHardware` et
  aux 403 répétés sur routes gatées : une IP qui brute-force des clés se fait
  throttle. Effort faible, pas de migration.
- **B.2 Hash des clés en DB** — une fuite DB ≠ fuite de credentials.
  `devices.public_key` → `public_key_hash` sha256. Coût : migration en place
  (non réversible → dump avant), `resolveDeviceAuth`/`getDeviceHardware`/
  `heartbeat`/`resolveUser` comparent le hash. **Recommandé** si la DB est
  exposée à des tiers (backups, replication, accès support) ; sinon le gain
  est marginal car la clé reste sniffable en clair sur le LAN (voir B.4).
- **B.3 Révocation UX** — supprimer la ligne `devices` révoque déjà ; ajouter
  un bouton « Révoquer » explicite + propagation immédiate (aujourd'hui un
  device révoqué garde sa session client jusqu'au prochain fetch).
- **B.4 TLS sur le LAN** — pertinent **seulement** si plusieurs caisses
  attaquent un serveur LAN (le serveur Electron embarqué n'écoute que
  localhost ; Vercel = déjà HTTPS). Si déploiement multi-caisses en magasin :
  cert interne ou mTLS device↔serveur. À confirmer selon le mode de
  déploiement réel.

### Phase C — Identité utilisateur (le vrai niveau 3) ⬜

Aujourd'hui l'autorisation est **device-level** : n'importe quel utilisateur
sur un appareil admin enregistré a tous les droits — le switch utilisateur
(`userSwitch`) est libre, sans credential par personne.

- **C.1 PIN/mot de passe par utilisateur** — `users.password_hash`
  (argon2id/bcrypt — jamais MD5/SHA1) ou PIN court pour le switch POS.
  Option paramétrable : switch libre (comportement actuel) vs PIN requis
  pour les rôles sensibles (Admin).
- **C.2 Sessions** — table `sessions` (user_id, device_id, expiration,
  révocable) — la table legacy `dc_sys.web_tokens` existe mais est
  inutilisée, la remplacer. Cookie `HttpOnly; Secure; SameSite=Strict` en
  navigateur ; stockage hors DOM sous Electron.
- **C.3 CSRF** — aujourd'hui l'auth passe par un **header custom**
  (`x-public-key`) → intrinsèquement résistant au CSRF (pas de cookie, le
  navigateur ne peut pas forger le header cross-origin). Si Phase C ajoute
  des cookies de session → ajouter token CSRF ou check `Origin`.
- **C.4 RBAC serveur** — `assertDeviceAuthorized` → `assertAuthorized` :
  accepte session **ou** device key pendant la transition ; rôles
  cashier/manager/admin/intervention vérifiés serveur sur chaque route.

### Phase D — Audit et supervision ⬜

- **D.1 Couverture audit** — `dc_pos.audit_events` trace déjà les opérations
  NF525 ; étendre aux écritures sensibles hors-NF525 (devices, users,
  paramètres, abonnement).
- **D.2 Alertes** — nouvelle clé inconnue → notification admin (le mécanisme
  `dc_sys.connections` + `getFailedLoginKey` existe, ajouter un badge/push).
- **D.3 Verrouillage progressif** — backoff exponentiel après échecs répétés
  sur `resolveUser`.

### Non prioritaire / refusé

- ❌ Forcer la rotation des clés existantes — rupture de service sans gain
  immédiat (les anciennes clés PRNG restent secret-difficiles à deviner :
  ~80 bits effectifs).
- ❌ Auth par mot de passe **seul** sans device key — la clé device sert
  aussi à l'identité matérielle (hardware config, quota, heartbeat).

---

## Validation Phase A

- `tsc` ✓ `eslint` ✓ `prettier` ✓ — 925/925 unitaires — 36/36 E2E
- Risque résiduel connu : un appareil **non enregistré** sur une vraie
  boutique voit 403 partout (comportement voulu — l'admin l'approuve via
  `dc_sys.connections` → DevicesConfig).
