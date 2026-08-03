# Guide d'installation de Tradiz sur une caisse enregistreuse (Windows)

## 1. Installer l'application

1. Téléchargez l'installateur correspondant à votre matériel depuis [GitHub Actions](https://github.com/flodef/Tradiz/actions/workflows/build-windows-installer.yml) :
    - **`tradiz-windows-installer-x64`** pour Windows 64-bit
    - **`tradiz-windows-installer-ia32`** pour Windows 32-bit
2. Décompressez le fichier `.zip` téléchargé.
3. Exécutez le fichier `Tradiz-<version>-win.exe` (ou `Tradiz-<version>-win-ia32.exe`).
4. Suivez l'assistant d'installation.

## 2. Configurer l'environnement (.env.local)

L'application a besoin d'un fichier `.env.local` pour fonctionner. Ce fichier contient les clés d'accès à vos données.

### Où placer le fichier

Le fichier `.env.local` doit être placé dans le **dossier de données utilisateur** de Tradiz :

-   **Windows** : `C:\Users\<votre-utilisateur>\AppData\Roaming\Tradiz\.env.local`

### Comment le créer

1. Ouvrez le Bloc-notes.
2. Copiez le contenu ci-dessous en remplaçant les valeurs par les vôtres :

```
# PostgreSQL
PG_HOST=votre_hote_postgresql
PG_USER=votre_utilisateur
PG_PASSWORD=votre_mot_de_passe
PG_DATABASE=nom_de_la_base

# Identifiant du commerce (obligatoire)
NEXT_PUBLIC_SHOP_ID=mon-commerce

# Plein écran (optionnel, "true" par défaut)
TRADIZ_FULLSCREEN=true
```

3. Cliquez sur **Fichier** > **Enregistrer sous**.
4. Naviguez vers `C:\Users\<votre-utilisateur>\AppData\Roaming\Tradiz\` (créez le dossier s'il n'existe pas).
5. Nommez le fichier `.env.local` (avec le point au début, sans extension supplémentaire).
6. Dans le champ **Type**, choisissez **Tous les fichiers (_._)** pour éviter l'extension `.txt`.
7. Cliquez sur **Enregistrer**.

### Variables disponibles

| Variable                  | Description                                              | Obligatoire   |
| ------------------------- | -------------------------------------------------------- | ------------- |
| `PG_HOST`                 | Hôte du serveur PostgreSQL                               | Si PostgreSQL |
| `PG_USER`                 | Utilisateur PostgreSQL                                   | Si PostgreSQL |
| `PG_PASSWORD`             | Mot de passe PostgreSQL                                  | Si PostgreSQL |
| `PG_DATABASE`             | Nom de la base de données                                | Si PostgreSQL |
| `NEXT_PUBLIC_SHOP_ID`     | Identifiant du commerce                                  | Oui           |
| `TRADIZ_FULLSCREEN`       | Démarrer en plein écran (`true`/`false`, défaut: `true`) | Non           |
| `TRADIZ_DISPLAY_PORT`     | Port COM de l'écran client LCD (ex: `COM3`)              | Non           |
| `TRADIZ_DISPLAY_BAUDRATE` | Vitesse du port série (défaut: `9600`)                   | Non           |

## 3. Démarrer en plein écran

L'application démarre **automatiquement en plein écran** par défaut.

-   Pour désactiver le plein écran, ajoutez `TRADIZ_FULLSCREEN=false` dans le fichier `.env.local`.
-   En plein écran, appuyez sur **F11** pour basculer entre plein écran et fenêtré.
-   Appuyez sur **Alt+F4** pour quitter l'application.

## 4. Configurer les périphériques

### Imprimante thermique

1. Ouvrez l'application Tradiz.
2. Allez dans les **Paramètres**.
3. Renseignez l'adresse IP de l'imprimante thermique (port 9100 par défaut).

Si l'imprimante est en USB avec un pilote générique, exécutez le script d'installation des pilotes en tant qu'administrateur :

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\Tradiz\drivers\install-printer-drivers.ps1"
```

### Lecteur de codes-barres

Aucune configuration nécessaire. Les lecteurs USB fonctionnent automatiquement (ils émettent les chiffres suivis d'un `Enter` comme un clavier).

### Écran client (LCD 2×20 caractères)

L'application envoie automatiquement les informations à l'écran client connecté en USB (port série COM). Aucune configuration n'est nécessaire si l'écran est connecté avant le lancement de l'application.

L'application détecte automatiquement les puces USB-série courantes (Prolific, FTDI, Silicon Labs, CH340). Si la détection automatique ne fonctionne pas, vous pouvez forcer le port COM dans le fichier `.env.local` :

```
TRADIZ_DISPLAY_PORT=COM3
TRADIZ_DISPLAY_BAUDRATE=9600
```

Si aucun écran n'est connecté, l'application fonctionne normalement — les messages d'affichage sont simplement ignorés.

L'écran affiche :

-   **En veille** : le nom du commerce (ou « Fermé » si la caisse est fermée)
-   **En transaction** : le produit en cours et le total
-   **En paiement** : un message spécifique au moyen de paiement et le total
-   **Après paiement** : le rendu monnaie

## 5. Lancer au démarrage de Windows

Pour que Tradiz démarre automatiquement avec Windows :

1. Appuyez sur **Win+R**, tapez `shell:startup` et appuyez sur Entrée.
2. Créez un raccourci vers `C:\Program Files\Tradiz\Tradiz.exe` dans ce dossier.
3. Tradiz démarrera automatiquement en plein écran à chaque allumage de la caisse.
