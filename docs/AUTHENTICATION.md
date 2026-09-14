# Authentification — niveaux et recommandation cible

## État actuel : niveau 1 (clé d'appareil + PIN utilisateur optionnel)

Chaque appareil possède une `public_key` stockée dans `dc_pos.devices`. Le client
l'envoie sur les routes sensibles via l'en-tête `x-public-key` (ou le paramètre
`publicKey`, utilisé pour les `<iframe>` qui ne peuvent pas poser d'en-tête).

**PIN utilisateur** : `users.pin_hash` (scrypt + sel — jamais le PIN en clair,
jamais exposé par l'API : `hasPin` seulement). Quand un utilisateur a un PIN,
le switch sur le POS exige `POST /api/sql/verifyUserPin` (device-gaté,
rate-limité : 5 échecs / 15 min / IP → 429, tentatives journalisées dans
`dc_sys.connections` sans le PIN). Le switch persisté en localStorage n'est
pas restauré pour un utilisateur avec PIN. Gestion : colonne PIN dans
`UsersConfig` (4–8 chiffres, `pin`/`clearPin` via `updateUsers`).

**Throttling des accès refusés** : `recordDeniedAccess` (`deviceAuth.ts`)
journalise chaque refus dans `dc_sys.connections` (`device_denied`, IP +
préfixe de clé, 1 écriture / min par couple) et retourne 429 au-delà de
30 refus / 15 min par IP — appliqué à toutes les routes gatées, `whoami`
et `getDeviceHardware`. Localhost exempté (Electron).

- `src/app/api/sql/deviceAuth.ts` — `resolveDeviceAuth` résout
  device → utilisateur lié → rôle ; `assertDeviceAuthorized(request, shopId, roles)`
  retourne 403 si le device est inconnu ou si le rôle n'est pas autorisé.
- `GET /api/sql/whoami` — sonde d'autorisation (authorized / admin / intervention).
- `src/app/utils/deviceFetch.ts` — `fetch` côté client qui pose l'en-tête.
  `deviceFetchIfKnown` fait de même sans jamais créer de clé, pour les appels
  montés aussi sur les pages publiques (ex. `VersionChecker` dans le layout
  racine).
- `DeviceGate` (`AdminConfigWrapper`) bloque l'affichage des pages `/admin/*`
  pour les appareils non enregistrés ; les contrôles de rôle par page
  (`isAdmin` / `isCashier`) restent en place.

Couverture des routes :

- **`/api/sql/*` internes** — toutes gatées par `assertDeviceAuthorized` :
  lecture POS (paramètres, catalogue, clients, transactions…) réservée aux
  appareils enregistrés ; `['admin']` pour les routes de gestion
  (`update*`, `getDevices`, `getFailedLoginKey`, `getReviews`,
  `deleteReview`, `auditEvents`, `verifyIntegrity`…).
- **Routes métier hors `/api/sql`** — gatées pareil : `counter-order`,
  `complete-order`, `tpe-payment`, `open-cash-drawer`, `test-display`,
  `scan-printers`, `list-com-ports`, `local-ip`, `spreadsheet`,
  `facturx/generate`, `pennylane/push`.
- **Restent ouvertes volontairement** — bootstrap (`resolveUser`, `whoami`,
  `getDbConfig`), lookup auto-scopé (`getDeviceHardware`, `heartbeat`),
  `resetDemo` (host démo uniquement), site public (`/api/public/*`,
  `create-order`, `revolut-config`, `version`, `shop-id`).

Cas particuliers :

- **Pas de bootstrap automatique** — clé inconnue (même table `devices`
  vide) ou shop sans utilisateur `Admin` ⇒ blocage. Un admin système
  débloque l'appareil en insérant sa clé dans `devices` rattachée à un
  utilisateur `Admin` ; la clé est récupérable dans `dc_sys.connections`,
  où `resolveUser` logue chaque tentative d'accès.
- **Demo** — clé inconnue auto-enregistrée sur le premier Admin (comme
  `resolveUser`), pour que n'importe quel testeur puisse ouvrir la démo.
- **Intervention** — devices `intervention = true` : exclus de `getDevices`
  et du quota, pas visibles dans l'admin. Leurs clés sont en base, pas
  besoin de les renvoyer.

### Limites connues du niveau 1

- La clé circule en clair en HTTP sur le LAN → sniffable.
- Bearer token : quiconque copie une clé usurpe l'appareil.
- Les clés existantes générées avant `generateSecureId` (PRNG `Math.random`)
  restent valides — migration non forcée ; les nouvelles clés ont 128 bits
  d'entropie (`crypto.getRandomValues`).
- Révocation : supprimer la ligne `devices` révoque immédiatement et le
  heartbeat (`registered: false`) force le rechargement vers l'écran
  d'enregistrement en ≤ 30 s. Pas d'expiration des clés.
- Le PIN protège l'identité au switch (ticket au bon nom) et, avec le flag
  `requireUserAuth`, devient la borne d'autorisation des routes admin —
  voir niveau 3.

## Niveau 3 — sessions utilisateur + RBAC (implémenté, opt-in)

### Sessions (en place)

- `POST /api/sql/verifyUserPin` crée une session `dc_pos.sessions`
  (user_id, device_id, `token_hash` SHA-256, `expires_at` 12 h,
  `revoked_at`) et renvoie le token opaque — jamais stocké en clair.
- Session **liée au device** : `resolveUserSession` exige
  `token_hash + device_id` — un token copié sur une autre machine ne
  résout pas.
- Transport : header `x-user-token` (posé par `deviceFetch`), stocké en
  `localStorage` côté client (`userSession.ts`). Pas de cookie → pas de
  surface CSRF.
- `POST /api/sql/logoutUser` révoque la session ; `UserSwitchPopup`
  révoque la session courante à chaque switch et `processData` ne
  restaure un utilisateur à PIN que si une session valide existe.
- Purge opportuniste des sessions expirées/révoquées à chaque login.

### RBAC (en place, derrière le flag `requireUserAuth`)

- Flag par boutique : `parameters.requireUserAuth` (switch dans
  Paramètres admin). Quand actif, `assertDeviceAuthorized(['admin'])`
  exige une session de rôle Admin — le rôle vient de la **personne**,
  plus de la machine.
- Séparation effective : la device key = identité matérielle
  (enregistrement, heartbeat, quota) ; la session = identité humaine
  (rôle, droits admin).
- Devices d'intervention exempts (support indépendant des PINs boutique).
- Gardes-fous : activation refusée (409) sans admin avec PIN ;
  `updateUsers` refuse (409) de retirer le dernier PIN admin quand le
  flag est actif ; `DeviceGate` affiche un prompt PIN admin
  (`UserSwitchPopup` filtré `role: Admin`) quand `whoami` signale
  `requiresUserAuth` sans session admin.
- `whoami` renvoie `requiresUserAuth` et calcule `admin` depuis la
  session quand le flag est actif.

### Audit & supervision (en place)

- Les écritures sensibles (devices, users, paramètres, abonnement) sont
  tracées dans `audit_events` avec l'acteur **vérifié serveur**
  (session > utilisateur lié au device) — le `changedBy` client,
  forgeable, est ignoré.
- `user_login` trace chaque authentification PIN réussie.
- La section Appareils affiche une alerte quand une clé inconnue tente
  de se connecter (`getFailedLoginKey` + date de la tentative).
- `resolveUser` applique un verrouillage exponentiel après échecs
  répétés (15 min → ×2 → 24 h, header `Retry-After`) ; les refus
  device (`device_denied`) et les échecs PIN (`pin_attempt`) sont
  comptés dans `dc_sys.connections` avec seuils 429.

### Reste à faire (niveau 3 complet)

- Généraliser les rôles session au-delà d'admin (`manager`, `service`)
  si un jour des routes non-admin doivent distinguer les utilisateurs.
- Expiration configurable, révocation en masse depuis l'admin (liste des
  sessions actives), rotation automatique du token.
- HTTPS/TLS en LAN (certificat interne ou mTLS) si plusieurs caisses
  partagent un serveur — aujourd'hui la clé et le token circulent en
  clair sur le réseau local.
- Alertes proactives hors UI admin (push/email) sur nouveau device ou
  rafale de refus.

### Ce qu'il ne faut pas faire

- Pas de mots de passe en clair, pas de token dans les URL/logs.
- Ne pas logger les `public_key` / tokens de session.
- Pas de bypass "header magique" côté client (tout se vérifie serveur).
- Ne pas exposer la liste des clés dans une API, même authentifiée, sans
  besoin explicite (cf. `getDevices` qui filtre déjà les devices
  d'intervention).
