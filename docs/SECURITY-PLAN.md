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

### A.4 — Durcissements optionnels : arbitrés

| Option                             | Effort                                                                 | Décision                  |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| Hasher `public_key` en DB (sha256) | Moyen — migration irréversible, toutes les routes comparent des hashes | Reporter (voir Phase B.2) |
| Rotation/expiration des clés       | Moyen — UX de renouvellement à inventer                                | Reporter                  |
| Rate limiting routes sensibles     | Faible — `resolveUser` a déjà un 429                                   | ✅ Phase B.1 faite        |

---

## Ce qui reste — recommandations

### Phase B — Durcissement court terme (faible risque)

- **B.1 Rate limiting généralisé ✅** — `recordDeniedAccess` dans
  `deviceAuth.ts` : chaque refus (clé absente/inconnue/rôle insuffisant) est
  journalisé dans `dc_sys.connections` (`type: 'device_denied'`, IP +
  préfixe de clé de 8 chars — jamais la clé entière), dédupliqué à 1
  écriture / min par (IP, clé). Au-delà de **30 refus / 15 min par IP →
  429**. Branché sur `assertDeviceAuthorized` (les 45 routes gatées),
  `whoami` (403) et `getDeviceHardware` (404). **Exemption** : toute requête
  dont l'IP est indéterminable — c.-à-d. sans en-tête de forwarding
  (`x-vercel-forwarded-for`, `x-real-ip`, `x-forwarded-for`) — est exemptée
  du throttle (`ip_address = 'unknown'`, traitée comme loopback). En
  pratique : sur Vercel la plateforme pose toujours un en-tête → le throttle
  est actif ; en Electron/embarqué ou sur un serveur LAN auto-hébergé sans
  reverse-proxy, aucune requête n'a d'en-tête → le throttle est
  **inopérant**. À savoir avant de compter dessus en déploiement LAN.
- **B.2 Hash des clés en DB** ⬜ — une fuite DB ≠ fuite de credentials.
  `devices.public_key` → `public_key_hash` sha256. Coût : migration en place
  (non réversible → dump avant), `resolveDeviceAuth`/`getDeviceHardware`/
  `heartbeat`/`resolveUser` comparent le hash. **Recommandé** si la DB est
  exposée à des tiers (backups, replication, accès support) ; sinon le gain
  est marginal car la clé reste sniffable en clair sur le LAN (voir B.4).
- **B.3 Révocation UX ✅** — la suppression d'un appareil dans
  DevicesConfig révoque immédiatement (la clé disparaît de `devices` → 403
  partout). **Propagation** : le heartbeat retourne `registered: false` →
  `DataProvider` recharge la page → `resolveUser` échoue → écran
  « appareil non enregistré » au prochain heartbeat (≤30 s). Un appareil
  jamais enregistré n'entre jamais dans la boucle heartbeat (pas de
  `transactionsFilename`), donc pas de risque de reload-loop.
- **B.4 TLS sur le LAN** ⬜ — pertinent **seulement** si plusieurs caisses
  attaquent un serveur LAN (le serveur Electron embarqué n'écoute que
  localhost ; Vercel = déjà HTTPS). Si déploiement multi-caisses en magasin :
  cert interne ou mTLS device↔serveur. À confirmer selon le mode de
  déploiement réel.

### Phase C — Identité utilisateur (le vrai niveau 3)

- **C.1 PIN par utilisateur ✅** — `users.pin_hash` (scrypt + sel,
  `src/app/api/sql/pinHash.ts`, migration `migrate-users-pin.sql`).
    - `POST /api/sql/verifyUserPin` : device-gaté + **rate-limité 5 échecs /
      15 min par utilisateur** — plus par IP quand l'IP distingue les
      clients (logs `pin_attempt` dans `dc_sys.connections` — jamais le PIN
      ni le hash). Le scoping par utilisateur évite le bucket partagé
      `ip_address = 'unknown'` d'Electron : 5 fautes d'un caissier ne
      verrouillent plus les autres.
    - `getUsers`/`updateUsers` exposent `hasPin` uniquement ; `updateUsers`
      accepte `pin` (4–8 chiffres, hashé serveur) et `clearPin` — omettre les
      deux conserve le PIN existant.
    - `UserSwitchPopup` : un utilisateur avec PIN exige la saisie du code
      avant le switch ; sans PIN → comportement inchangé. Le switch persisté
      en localStorage n'est **pas** restauré pour un utilisateur avec PIN.
    - `UsersConfig` : colonne PIN (saisie masquée, effaçable) pour les
      utilisateurs non-admin — les admins restent gérés hors UI (inchangé).
- **C.2 Sessions ✅** — table `dc_pos.sessions` (user_id, device_id,
  token_hash, expires_at, revoked_at — migration `migrate-sessions.sql`,
  PG + MariaDB). `verifyUserPin` crée une session (token opaque 128 bits,
  hash SHA-256 en base, **liée au device** — un token copié ailleurs ne
  résout pas), TTL 12 h, purge opportuniste. `POST /api/sql/logoutUser`
  révoque. Le token circule en header `x-user-token` (posé par
  `deviceFetch` depuis `localStorage` via `userSession.ts`) — pas de
  cookie, donc C.3 reste non applicable.
- **C.3 CSRF** ✅ — l'auth passe par des **headers custom**
  (`x-public-key`, `x-user-token`) → intrinsèquement résistant au CSRF
  (pas de cookie, le navigateur ne peut pas forger le header
  cross-origin). Si un jour des cookies de session sont ajoutés → token
  CSRF ou check `Origin` requis.
- **C.4 RBAC serveur 🟡** — flag par boutique `requireUserAuth`
  (paramètre, UI `ParametersConfig`) : quand activé, les routes `['admin']`
  exigent une **session utilisateur de rôle Admin** — la clé device ne
  prouve plus que la machine est enregistrée ; le rôle vient de la
  session. Un admin PIN-vérifié peut donc agir depuis n'importe quel
  appareil enregistré, et un caissier switché sur un appareil admin
  n'hérite plus de ses droits. Les devices d'intervention gardent l'accès
  device-level (le support ne dépend pas d'un PIN boutique). Gardes-fous :
  le flag ne s'active que si ≥1 admin a un PIN (`updateParameters` → 409),
  et `updateUsers` → 409 si la sauvegarde retirerait le dernier PIN admin.
  `DeviceGate` affiche un prompt PIN admin quand `whoami` renvoie
  `requiresUserAuth` sans session admin.
  **Reste** : sans le flag, l'autorisation reste device-level (comportement
  historique préservé) ; généraliser le RBAC à d'autres rôles que admin
  (manager/service) est possible mais non fait — la granularité actuelle
  suffit au modèle de menace boutique.

### Phase D — Audit et supervision ✅

- **D.1 Couverture audit ✅** — `updateDevices` émet `device_change`
  (ajoutés/modifiés/révoqués — jamais les clés) ; `updateUsers` détaille
  les PIN définis/effacés (compteurs, jamais valeur ni hash) ;
  `verifyUserPin` émet `user_login` sur succès — c'est lui qui attribue
  les écritures sensibles à un utilisateur réel. Nouveau
  `resolveAuditActor` (session > utilisateur lié au device > 'inconnu') :
  `user_name` est désormais **vérifié serveur** dans `updateUsers`,
  `updateDevices` et `updateParameters` (le `changedBy` client, forgeable,
  est ignoré).
- **D.2 Alertes ✅** — `getFailedLoginKey` renvoie aussi la date de la
  tentative ; `DevicesConfig` affiche une bannière « appareil inconnu
  détecté » (date + bouton Ajouter qui pré-remplit la clé) au chargement
  de la section. L'alerte se résout d'elle-même une fois la clé
  enregistrée.
- **D.3 Verrouillage progressif ✅** — `resolveUser` : remplacé le bloc
  sec « 3 échecs → 24 h » par un cooldown exponentiel — 3 échecs → 15 min,
  puis ×2 par échec (30 min, 1 h, 2 h, 4 h, 8 h, 16 h), plafonné à 24 h,
  avec header `Retry-After`. Un appareil légitime mal configuré récupère
  vite ; le brute-force devient exponentiellement lent.

### Non prioritaire / refusé

- ❌ Forcer la rotation des clés existantes — rupture de service sans gain
  immédiat (les anciennes clés PRNG restent secret-difficiles à deviner :
  ~80 bits effectifs).
- ❌ Auth par mot de passe **seul** sans device key — la clé device sert
  aussi à l'identité matérielle (hardware config, quota, heartbeat).

---

## Validation

- Phase A : `tsc` ✓ `eslint` ✓ `prettier` ✓ — 925/925 unitaires — 36/36 E2E
- B.1 + B.3 + C.1 : 33 tests ajoutés (`deviceAuth` throttling ×5, `userPin`
  hash/verify/rate-limit/updateUsers ×14)
- Risque résiduel connu : un appareil **non enregistré** sur une vraie
  boutique voit 403 partout (comportement voulu — l'admin l'approuve via
  `dc_sys.connections` → DevicesConfig).
