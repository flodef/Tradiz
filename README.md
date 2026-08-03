# Présentation

Ce projet est destiné à faciliter l'utilisation d'une caisse enregistreuse.

Il est constitué d'une application web facilement accessible en ligne depuis un navigateur, sur mobile, tablette ou ordinateur.

Il est également possible de l'utiliser hors-ligne, en chargeant l'application puis en laissant l'onglet du navigateur ouvert.

L'application mobile est disponible en production à l'adresse suivante : [pos.tradiz.fr](https://pos.tradiz.fr)

Elle est également disponible en démonstration à l'adresse suivante : [demo.tradiz.fr](https://demo.tradiz.fr)

# S'approprier le projet

Le projet étant open source, il est possible de le cloner et de l'utiliser pour ses propres besoins.

## Création des données

Les données de l'application sont stockées dans une base de données PostgreSQL. Consultez le guide rapide pour créer votre base de données : [`scripts/QUICK_START.md`](scripts/QUICK_START.md)

### Structure de la base de données

Les scripts de création de la base de données sont disponibles dans le répertoire `scripts/` :

-   [`create-postgres-database.sql`](scripts/create-postgres-database.sql) pour PostgreSQL
-   [`create-mariadb-database.sql`](scripts/create-mariadb-database.sql) pour MariaDB

#### Catégories

La table **Catégories** contient la liste des catégories de produits, ainsi que les taxes afférentes.

Afin d'avoir une interface épurée, il est recommandé de créer un maximum de 6 catégories.

#### Monnaies

Par défaut, la seule monnaie disponible est l'Euro. Il est possible d'ajouter d'autres monnaies.
Il est également possible d'ajouter la même monnaie avec une mercuriale différente (par exemple, pour afficher des prix différents pour les locaux et les touristes).

Enfin, il faut paramètrer le nom de la devise, son symbole, la valeur maximale lors d'un achat ainsi que le nombre de décimales à afficher.

#### Produits

La table **Produits** contient la liste des produits, avec la catégorie associée, sa disponibilité, le nom du produit et son prix.

Il est possible d'ajouter des prix différents pour un même produit en configurant plusieurs monnaies.

Si un produit est inutilisé périodiquement, il est possible de le cacher de l'interface en le marquant comme indisponible.

#### Paiements

La table **Paiements** contient la liste des moyens de paiements possibles.

Pour les paiements en monnaie numérique nécessitant un QR code, il est nécessaire d'ajouter une adresse publique vers laquelle envoyer le paiement.
Pour les virements, il est également nécessaire de renseigner un IBAN.

Il est enfin possible de cacher une méthode de paiement.

#### Utilisateurs

La table **Utilisateurs** contient la liste des utilisateurs de l'application. Cela permet de restreindre l'accès à l'application, ainsi que de donner des droits différents à chaque utilisateur en fonction de son rôle : caisse, service ou cuisine.

Chaque utilisateur doit avoir :

-   **une clé publique**, propre à son appareil de connexion
-   **un nom** permettant de l'identifier
-   **un rôle** : caisse, service ou cuisine

#### Paramètres

La table **Paramètres** contient les différents paramètres de l'application :

-   **le nom du commerce**
-   **l'email du commerce** : pour recevoir les demandes d'accès à l'application si vous en restreignez l'accès
-   **un message de remerciement à afficher après un paiement**
-   **une mercuriale quadratique à utiliser lors d'un paiement** : la mercuriale quadratique est une fonction mathématique permettant de calculer le prix d'un produit en fonction de la quantité achetée
-   **la dernière date de mise à jour des données** : se calcule automatiquement, à ne pas modifier

## Déploiement de l'application

Le déploiement de l'application permet, entre autres :

-   de s'affranchir d'une demande d'autorisation d'accès
-   de choisir son propre domaine / site web
-   d'être autonome et indépendant

### Déployer avec Vercel

Pour simplement créer l'application, il est préférable d'utiliser le processus automatisé de [Vercel](https://vercel.com) :

[![Créer avec Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/flodef/Tradiz&project-name=Tradiz&repository-name=Tradiz)

Une fois sur Vercel, créer un répertoire git en cliquant sur **Create**.

Le projet va ensuite automatiquement se déployer.

Une fois déployé, il suffit de cliquer sur la capture d'écran du projet. Cela va ouvrir une nouvelle page dans le navigateur avec l'application.

La page principale est une application de démonstration. Pour accéder à vos données, il va falloir paramétrer l'application avec vos identifiants.

### Paramétrer l'application

Afin de paramétrer l'application, il faut accéder au Dashboard en cliquant sur **Continue to Dashboard**.

Une fois dans le Dashboard, cliquer sur le projet puis aller dans les variables d'environnement : menu **Settings**, puis sous-menu **Environment Variables**.

Il y a 5 paramètres à entrer afin de connecter l'application à votre base de données PostgreSQL :

-   **PG_HOST** : l'hôte du serveur PostgreSQL
-   **PG_USER** : l'utilisateur PostgreSQL
-   **PG_PASSWORD** : le mot de passe PostgreSQL
-   **PG_DATABASE** : le nom de la base de données
-   **NEXT_PUBLIC_SHOP_ID** : l'identifiant de votre commerce

Il existe également d'autres **paramètres optionnels** permettant de personnaliser l'application :

-   **NEXT_PUBLIC_CLUSTER_ENDPOINT** est l'adresse d'un serveur permettant de gérer les interactions avec le réseau Solana.
-   **NEXT_PUBLIC_IS_DEV** est un booléen permettant de définir si l'application est en mode développement ou production. Cela permet d'effectuer des tests sans dépenser de SOL. _Par défaut, false. Valeur possible : true ou false._

### Application des paramètres

Une fois les paramètres saisis, il est nécessaire de mettre à jour l'application afin d'appliquer les paramètres.

Aller dans le menu **Deployments**. Une ligne s'affiche avec les différentes versions déployées. Il faut ouvrir le menu de la dernière version, la plus en haut, en cliquant tout à droite, sur les trois points horizontaux.

Sélectionner le menu **Redeploy**, puis dans le popup qui s'ouvre, cliquer sur le bouton **Redeploy**.

Attendre que le déploiement se fasse (environ 1 minute), puis ouvrir l'application en cliquant sur la capture d'écran ou le bouton **Visit**.

Et voilà 🥳🥳🥳

## Comment modifier le projet

### Cloner le projet

Cloner le code source du projet en ouvrant un terminal de commande puis en utilisant la commande suivante :

```bash
git clone https://github.com/flodef/Tradiz.git
```

Alternativement, il est possible de télécharger le code source en cliquant sur le bouton **Code** puis **Download ZIP** depuis la page du projet sur Github : https://github.com/flodef/Tradiz

### Installer les dépendances

Une fois le projet cloné, il faut installer les dépendances en utilisant la commande suivante :

```bash
bun install
# or
npm install
# or
yarn install
# or
pnpm install
# or
```

### Lancer le projet en local

Pour lancer le projet en local, il faut utiliser la commande suivante :

```bash
bun dev
# or
npm run dev
# or
yarn dev
# or
pnpm dev
```

Ouvrir ensuite un navigateur web à l'adresse http://localhost:3000

### Modifier le code

Le code source est dans le répertoire `app`.

Le fichier `app/page.tsx` contient le code de la page principale.

Le fichier `app/components/` contient les composants utilisés par la page principale.

Vous pouvez modifier le code source et voir les modifications en temps réel dans le navigateur.

### Déployer le projet

Une fois les modifications effectuées, il faut les déployer.

Pour ce faire, il faut utiliser la commande suivante :

```bash
npm run build
# or
yarn build
# or
pnpm build
```

Une fois le projet construit, il faut le déployer en utilisant la commande suivante :

```bash
npm run start
# or
yarn start
# or
pnpm start
```

Ouvrir ensuite un navigateur web à l'adresse http://localhost:3000

### Publier les modifications

Une fois le projet déployé, il faut publier les modifications sur Github.

Pour ce faire, il faut utiliser la commande suivante :

```bash
git add .
git commit -m "message de commit"
git push
```

Alternativement, vous pouvez utiliser l'interface graphique de Github Desktop ou celle de votre environnement de développement.

### Déployer sur Vercel

Une fois les modifications publiées sur Github, il faut déployer le projet sur Vercel.

Pour ce faire, il faut utiliser la commande suivante :

```bash
vercel
```

Une fois la commande lancée, il faut suivre les instructions.

Alternativement, vous pouvez utiliser l'interface graphique de Vercel afin de lier votre compte Github et déployer le projet automatiquement à chaque commit.

### Tradiz avec impression thermique

Cette application peut s'exécuter sur une tablette Android à l'aide de Termux pour imprimer sur une imprimante thermique Wi-Fi de manière locale.

#### Prérequis

-   Tablette Android avec Termux installé : [téléchargez depuis F-Droid](https://f-droid.org/fr/packages/com.termux/).
-   Imprimante thermique Wi-Fi sur le même réseau que la tablette.
-   Adresse IP de l'imprimante (par exemple, `192.168.1.100`) à remplir directement dans les paramètres de l'application.

#### Instructions de configuration

1. Ouvrez Termux sur votre tablette Android.
2. Si vous avez déjà un fichier .env.local à disposition, vous pouvez le télécharger depuis votre ordinateur / serveur via un gestionnaire de fichiers / réseau social, puis donner à Termux le droit d'accéder au dossier de stockage de votre appareil :
    ```bash
    termux-setup-storage
    ```
    Vérifier bien que le fichier .env.local est bien téléchargé au bon endroit :
    ```bash
    ls ~/storage/downloads/_.env.local
    ```
3. Téléchargez le script de configuration et exécutez-le (vous aurez à confirmer lors de la demande de copie de nouveau fichier) :
    ```bash
    curl -O https://raw.githubusercontent.com/flodef/Tradiz/main/scripts/setup-termux.sh
    bash setup-termux.sh
    ```
4. Après une longue installation (seulement la première fois), l'application s'ouvrira dans votre navigateur à l'adresse http://localhost:3000/username. Utilisez l'application pour imprimer des commandes en cours, des reçus, le rapport des ventes / commandes de la journée, du mois et de l'année, directement sur l'imprimante thermique
5. Pour arrêter l'application, il faut utiliser la commande suivante :
    ```bash
    pkill -f npm
    ```
6. Pour redémarrer l'application, il faut utiliser la commande suivante :
    ```bash
    bash ~/run-app.sh
    ```
7. Pour mettre à jour l'application, il faut utiliser la commande suivante :
    ```bash
    bash ~/install-app.sh
    ```

#### Installer une raccourci pour lancer l'application

1. Téléchargez [l'application Termux:Widget depuis F-Droid](https://f-droid.org/fr/packages/com.termux.widget/).
2. Ajoutez un raccourci à l'écran d'accueil :

-   sur votre tablette Android, appuyez longuement sur l'écran d'accueil et sélectionnez “Widgets.”
-   Trouvez Termux:Widget et ajoutez-le.
-   Sélectionnez tradiz.sh (lance l'application) dans la liste des widgets.
-   Cela crée un icône qui exécute le script lorsqu'elle est pressée.

3. Pour android 10 et supérieurs, il faut ajouter l'autorisation de s'afficher au-dessus des autres applications. Pour ce faire, il faut aller dans Paramètres > Applications > Termux:Widget > Autorisations > S'afficher au-dessus des autres applications.

#### Alternative

Une alternative est de configurer votre box / routeur pour qu'elle redirige les requêtes vers l'application.
ATTENTION : cette alternative n'est possible que si votre fournisseur d'accès Internet vous fournit une adresse IP publique. C'est le cas avec les box filaires branchées sur le réseau câblé, mais cela ne fonctionne pas avec un routeur branché sur un opérateur mobile / modem 4G.

##### Configuration du port forwarding

Pour configurer un port forwarding sur le port de l'imprimante (9100 par défaut) :

-   accéder à l'interface de votre box / routeur (généralement http://192.168.1.1 ou http://192.168.0.1)
-   dans le menu de configuration, trouver la section **Port Forwarding**
-   ajouter un nouveau port forwarding avec les paramètres suivants :
    -   Port Externe / External Port: 9100 (ou un autre port si vous préférez ; par exemple, 9101 pour éviter les conflits)
    -   IP Interne / Internal IP: 192.168.1.55 (l'adresse IP de votre imprimante)
    -   Port Interne / Internal Port: 9100 (le port par défaut de l'imprimante)
    -   Protocole / Protocol: TCP
-   sauvegarder les modifications

NB : assurez-vous que la tablette et l'imprimante sont sur le même réseau Wi-Fi, que l'imprimante est connectée à Internet et qu'elle ait une adresse IP fixe.

##### Mettre en place un Dynamic DNS (si nécessaire):

Si votre fournisseur d'accès Internet attribue des adresses IP publiques dynamiques, utilisez un service de Dynamic DNS (par exemple, No-IP, DynDNS) :

-   Inscrivez-vous et créez un nom d'hôte (par exemple, yourdomain.dyndns.org).
-   Configurez votre routeur ou un appareil sur votre réseau pour mettre à jour le service DNS avec votre adresse IP publique actuelle.
-   Vérifiez que le nom d'hôte résout votre adresse IP publique (par exemple, 1.2.3.4).

Si vous avez une adresse IP publique statique, sautez cette étape et utilisez 1.2.3.4 directement.

Une fois le port forwarding et le Dynamic DNS configurés, vous devez mettre à jour l'adresse IP de l'imprimante dans les paramètres de l'application.

Vous pouvez dorénavant imprimer directement depuis l'application.

## En savoir plus sur Next.js

Pour en savoir plus sur Next.js, vous pouvez consulter les ressources suivantes :

-   [Next.js Documentation](https://nextjs.org/docs) - apprenez les fonctionnalités et l'API de Next.js.
-   [Learn Next.js](https://nextjs.org/learn) - un tutoriel intéractif Next.js.

# Fonctionnalités

## Écran client (backscreen)

L'application pilote un écran client face au client via `postMessage` vers la fenêtre parente. L'affichage s'adapte automatiquement selon l'état de la caisse :

-   **En veille (caisse fermée)** : affiche « Fermé » sur la deuxième ligne.
-   **En veille (caisse ouverte)** : affiche le nom du commerce sur les deux lignes (40 caractères, 2 × 20).
-   **En transaction** : affiche le produit en cours sur la première ligne et le total sur la deuxième.
-   **En paiement** : affiche un message spécifique au moyen de paiement (ex. « Insérez votre carte », « Règlement en espèces », « Scannez le QR code ») et le total restant à payer.
-   **Rendu monnaie** : le montant rendu reste affiché jusqu'au début de la transaction suivante.

Les messages de paiement sont matchés de façon robuste : les libellés sont normalisés (minuscules, sans accents) et comparés à des alias connus (cb, carte, visa, espèces, chèque, etc.).

L'envoi des messages d'affichage est indépendant du mode DigiCarte : l'application tente toujours de communiquer avec l'écran client, et ignore silencieusement les erreurs si aucun écran n'est présent.

## Suppression de produit et mise à jour du total

Lors de la suppression d'un produit sélectionné, la sélection se déplace automatiquement sur le produit précédent et le total est recalculé immédiatement (correction du bug de total obsolète).

## Propagation des catégories

Les renommages et suppressions de catégories sont automatiquement propagués aux formules :

-   **Renommage** : les éléments de formule associés à la catégorie sont mis à jour.
-   **Suppression** : les éléments de formule sont déplacés vers la catégorie par défaut (« Sans catégorie »), et les formules qui n'ont plus aucun élément sont supprimées.

## Clavier numérique (NumPad)

Le bouton de suppression du NumPad est rétabli. Un appui simple sur « Supprimer » alors qu'aucun produit n'est sélectionné et que le montant est à 0 demande la confirmation de la suppression de la commande entière.

# Intégration continue (CI)

Le projet dispose de deux workflows GitHub Actions :

-   **[Node.js CI](https://github.com/flodef/Tradiz/actions/workflows/node.js.yml)** — à chaque push et pull request : installe les dépendances avec Bun et lance les tests Vitest sur Node.js 22.
-   **[Build Windows Installer](https://github.com/flodef/Tradiz/actions/workflows/build-windows-installer.yml)** — à chaque push sur `main`, release publiée ou déclenchement manuel : construit l'installateur Windows (`electron-builder`) et publie l'artefact ou la release GitHub.

Les deux workflows utilisent Node.js 22.x, Bun et les versions récentes des actions GitHub (`checkout@v5`, `setup-node@v4`, `setup-bun@v2`).

# Contribuer au projet

Toutes contributions, retours ou idées sont les bienvenus. 🙏🏻🙏🏻🙏🏻
