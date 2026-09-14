# Authentification — niveaux et recommandation cible

## État actuel : niveau 0 (identité par clé d'appareil)

Chaque appareil possède une `public_key` stockée dans `dc_pos.devices`. Le client
l'envoie sur les routes sensibles via l'en-tête `x-public-key` (ou le paramètre
`publicKey`, utilisé pour les `<iframe>` qui ne peuvent pas poser d'en-tête).

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

### Limites connues du niveau 0

- La clé circule en clair en HTTP sur le LAN → sniffable.
- Bearer token : quiconque copie une clé usurpe l'appareil.
- Les clés existantes générées avant `generateSecureId` (PRNG `Math.random`)
  restent valides — migration non forcée ; les nouvelles clés ont 128 bits
  d'entropie (`crypto.getRandomValues`).
- Pas de révocation ni d'expiration : supprimer la ligne `devices` est le
  seul moyen de révoquer.

## Recommandation cible : niveau 3 (sessions utilisateur + RBAC)

À implémenter quand l'admin s'ouvrira à des clients exigeants. Principes :

### Comptes et sessions

- Authentification par compte utilisateur : identifiant + mot de passe
  (hashé avec **argon2id** ou bcrypt — jamais en clair, jamais MD5/SHA1).
- Session stockée en base (`sessions` : user_id, device_id, expiration,
  révocable) ou token signé (JWT/opaque) — préférer la table pour pouvoir
  révoquer immédiatement.
- Cookie `HttpOnly; Secure; SameSite=Strict` en contexte navigateur ; pour
  Electron, stockage du token hors DOM si possible.
- Expiration de session + rotation ; endpoint `logout` qui révoque.
- Protection CSRF pour toute requête d'écriture authentifiée par cookie
  (token CSRF ou vérification `Origin`/`SameSite`).

### RBAC

- Rôles : `cashier` (POS + edit_menu), `manager` (admin magasin sans
  fonctions dangereuses), `admin` (tout), `intervention` (support — accès
  étendu, tracé).
- Vérification **côté serveur** sur chaque route : un middleware/helper
  commun (`assertRole(request, [...])`) remplaçant `assertDeviceAuthorized`.
- Séparer clairement **identité appareil** (device key, matériel, quota
  d'abonnement) et **identité utilisateur** (session, rôles). Un appareil
  héberge plusieurs utilisateurs ; un utilisateur peut se connecter sur
  plusieurs appareils.

### Transport et durcissement

- HTTPS/TLS obligatoire en production (même en LAN via certificat interne
  ou mTLS pour les devices).
- Rate limiting sur `login`/`whoami` (le mécanisme `dc_sys.connections`
  existe déjà côté `resolveUser` — le généraliser).
- Audit log : qui a fait quelle écriture sensible (paramètres, devices,
  utilisateurs, abonnement, attestation NF525).
- Verrouillage progressif après échecs répétés ; alerte sur nouveau device.

### Migration depuis le niveau 0

1. Ajouter `users.password_hash` (nullable) + table `sessions`.
2. Endpoint `POST /api/sql/login` (identifiant + mot de passe) → cookie de
   session ; `POST /api/sql/logout`.
3. Étendre `assertDeviceAuthorized` → `assertAuthorized` : accepte session
   **ou** device key pendant la transition.
4. L'UI : écran de login sur `/admin/*` (et éventuellement le POS).
5. Retirer le fallback device key des routes admin une fois tous les
   clients migrés ; les clés restent pour l'identité matérielle (hardware,
   quota, heartbeat).
6. Première installation : création du compte admin initial via
   l'assistant de setup, puis insertion du premier device en base par un
   admin système (clé récupérable dans `dc_sys.connections`).

### Ce qu'il ne faut pas faire

- Pas de mots de passe en clair, pas de token dans les URL/logs.
- Ne pas logger les `public_key` / tokens de session.
- Pas de bypass "header magique" côté client (tout se vérifie serveur).
- Ne pas exposer la liste des clés dans une API, même authentifiée, sans
  besoin explicite (cf. `getDevices` qui filtre déjà les devices
  d'intervention).
