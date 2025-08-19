# Présentation

Ce projet est destiné à faciliter l'utilisation d'une caisse enregistreuse.

Il est constitué d'une application web facilement accessible en ligne depuis un navigateur, sur mobile, tablette ou ordinateur.

Il est également possible de l'utiliser hors-ligne, en chargeant l'application puis en laissant l'onglet du navigateur ouvert.

L'application mobile est disponible en production à l'adresse suivante : [pos.tradiz.fr](https://pos.tradiz.fr)

Elle est également disponible en démonstration à l'adresse suivante : [demo.tradiz.fr](https://demo.tradiz.fr)

# S'approprier le projet

Le projet étant open source, il est possible de le cloner et de l'utiliser pour ses propres besoins.

## Création des données

### Importer les données de démonstration

Les données nécessaires pour utiliser l'application sont stockées dans un fichier Google Sheets. Il est donc nécessaire d'avoir un compte Google.

Ensuite, il faut importer le fichier de données de démonstration dans son propre Google Drive, en allant sur le lien suivant : [https://docs.google.com/spreadsheets/d/1XW4zcU3maFGeOu8tznoDHiHnd0qj0Fxy_DVq2Vkrcnw/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1XW4zcU3maFGeOu8tznoDHiHnd0qj0Fxy_DVq2Vkrcnw/edit?usp=sharing)

Une fois le fichier ouvert, cliquer sur le menu **Fichier** puis **Créer une copie**.

### Créer son propre fichier de données

#### Catégories

L'onglet **Catégories** contient la liste des catégories de produits, ainsi que les taxes afférentes.

Afin d'avoir une interface épurée, il est recommandé de créer un maximum de 6 catégories.

#### Monnaies

Par défaut, la seule monnaie disponible est l'Euro. Il est possible d'ajouter d'autres monnaies, en ajoutant une ligne en dessous.
Il est également possible d'ajouter la même monnaie avec une mercuriale différente (par exemple, pour afficher des prix différents pour les locaux et les touristes).

Enfin, il faut paramètrer le nom de la devise, son symbole, la valeur maximale lors d'un achat ainsi que le nombre de décimales à afficher.

#### Produits

L'onglet **Produits** contient la liste des produits, avec la catégorie associée, sa disponibilité, le nom du produit et son prix.

Il est possible d'ajouter des prix différents pour un même produit. Pour cela, il faut avoir au préalable ajouté une autre monnaie (voir chapitre ci-dessus).

Il faut ensuite ajouter une nouvelle colonne tout à droite : clic droit dans la colonne puis **Insérer une colonne à droite**. Puis ajouter le nom de la devise en haut de la colonne en la sélectionnant.

Si un produit est inutilisé périodiquement, il est possible de le cacher de l'interface en cochant la colonne **Indisponible**.

#### Paiements

L'onglet **Paiements** contient la liste des moyens de paiements possibles.

Pour les paiements en monnaie numérique nécessitant un QR code, il est nécessaire d'ajouter une adresse publique vers laquelle envoyer le paiement dans la colonne **Adresse**.
Pour les virements, il est également nécessaire de renseigner un IBAN dans cette colonne.

Il est enfin possible de cacher une méthode de paiement en cochant la colonne **Caché**.

#### Utilisateurs

L'onglet **Utilisateurs** contient la liste des utilisateurs de l'application. Cela permet de restreindre l'accès à l'application, ainsi que de donner des droits différents à chaque utilisateur en fonction de son rôle : caisse, service ou cuisine.

Chaque utilisateur doit avoir :

-   **une clé publique**, propre à son appareil de connexion
-   **un nom** permettant de l'identifier
-   **un rôle** : caisse, service ou cuisine

#### Paramètres

L'onglet **Paramètres** contient les différents paramètres de l'application :

-   **le nom du commerce**
-   **l'email du commerce** : pour recevoir les demandes d'accès à l'application si vous en restreignez l'accès
-   **un message de remerciement à afficher après un paiement**
-   **une mercuriale quadratique à utiliser lors d'un paiement** : la mercuriale quadratique est une fonction mathématique permettant de calculer le prix d'un produit en fonction de la quantité achetée
-   **la dernière date de mise à jour des données** : se calcule automatiquement, à ne pas modifier

### Partager le fichier de données

#### Donner accès au fichier de données

Une fois le fichier de données créé, il faut le partager afin que l'application puisse y accéder.

Pour cela, cliquer sur le menu **Fichier** puis **Partager** et **Partager avec d'autres**.

Dans le popup qui s'ouvre, cliquer sur **Restreint** sous **Accès général** puis **Tout le monde ayant le lien**.

#### Demander une autorisation d'accès

Afin que l'application puisse accéder au fichier de données, il est nécessaire de demander une autorisation d'accès.

Alternativement, vous pouvez déployer très facilement votre propre application. Dans ce cas-là, passez au chapitre suivant **Création de l'application**

Pour demander une autorisation d'accès, cliquer sur le bouton **Copier le lien** puis envoyer par email

-   le lien copié vers le fichier Google Sheet
-   un identifiant de votre choix

à l'adresse suivante : [flo@fims.fi](mailto:flo@fims.fi&subject=Accès%20au%20fichier%20de%20données%20FiMs%20POS).

#### Accéder à l'application

Après traitement de votre demande (environ 1 jour), vous recevrez un mail de confirmation avec l'adresse d'accès. Celle-ci sera : pos.fims.fi/Votre_Identifiant

## Déploiement de l'application

Le déploiement de l'application permet, entre autres :

-   de s'affranchir d'une demande d'autorisation d'accès
-   de choisir son propre domaine / site web
-   d'être autonome et indépendant

Il sera nécessaire de créer sa propre clé d'accès au fichier de données sur [Google console](https://console.cloud.google.com/)

### Paramètres d'accès au fichier de données

#### Récupération de l'identifiant du fichier

L'identifiant est inclus dans l'adresse web du fichier Google Sheet contenant les données.
Exemple : dans https://docs.google.com/spreadsheets/d/1XW4zcU3maFGeOu8tznoDHiHnd0qj0Fxy_DVq2Vkrcnw/edit#gid=0, l'identifiant du fichier est **1XW4zcU3maFGeOu8tznoDHiHnd0qj0Fxy_DVq2Vkrcnw** (compris entre `.../d/` et `/edit#gid=...`)

#### Récupération de la clé d'accès au fichier

Aller sur https://console.cloud.google.com/

Dans le menu en haut à gauche, sélectionner le menu **Api & Services** puis sous-menu **Credentials**.

Une fois dans la page **Credentials**, cliquer tout en haut de la page sur **+ Create Credentials** , puis **API key**.

La clé est affichée dans un popup où vous pouvez la copier.

### Déployer avec Vercel

Pour simplement créer l'application, il est préférable d'utiliser le processus automatisé de [Vercel](https://vercel.com) :

[![Créer avec Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/flodef/FiMs-POS&project-name=FiMs-POS&repository-name=FiMs-POS)

Une fois sur Vercel, créer un répertoire git en cliquant sur **Create**.

Le projet va ensuite automatiquement se déployer.

Une fois déployé, il suffit de cliquer sur la capture d'écran du projet. Cela va ouvrir une nouvelle page dans le navigateur avec l'application.

La page principale est une application de démonstration. Pour accéder à vos données, il va falloir paramétrer l'application avec vos identifiants.

### Paramétrer l'application

Afin de paramétrer l'application, il faut accéder au Dashboard en cliquant sur **Continue to Dashboard**.

Une fois dans le Dashboard, cliquer sur le projet puis aller dans les variables d'environnement : menu **Settings**, puis sous-menu **Environment Variables**.

Il y a 2 paramètres à entrer afin d'accéder aux données contenues dans le fichier Google Sheet :

-   **GOOGLE_SPREADSHEET_ID** : l'identifiant pointant vers le fichier
-   **GOOGLE_API_KEY** : la clé permettant l'accès vers le fichier

Pour ce faire :

-   entrer dans le champ **Key** : `GOOGLE_SPREADSHEET_ID` et dans le champ **Value** : _Votre_Identifiant_Fichier_
-   entrer dans le champ **Key** : `GOOGLE_API_KEY` et dans le champ **Value** : _Votre_Clé_Accès_Fichier_

Il existe également d'autres **paramètres optionnels** permettant de personnaliser l'application uniquement si vous utilisez le réseau Solana pour les paiements :

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
git clone https://github.com/flodef/FiMs-POS.git
```

Alternativement, il est possible de télécharger le code source en cliquant sur le bouton **Code** puis **Download ZIP** depuis la page du projet sur Github : https://github.com/flodef/FiMs-POS

### Installer les dépendances

Une fois le projet cloné, il faut installer les dépendances en utilisant la commande suivante :

```bash
npm install
# or
yarn install
# or
pnpm install
```

### Lancer le projet en local

Pour lancer le projet en local, il faut utiliser la commande suivante :

```bash
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

# Contribuer au projet

Toutes contributions, retours ou idées sont les bienvenus. 🙏🏻🙏🏻🙏🏻
