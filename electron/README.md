# Application de bureau Tradiz (Electron)

Ce dossier contient le wrapper Electron permettant d'executer Tradiz comme application de bureau Windows (ou multiplateforme) et de packager un installateur.

## Architecture

-   `main.js` : processus principal Electron. Il demarre le serveur Next.js en mode `standalone`, puis ouvre la fenetre principale sur `http://localhost:3001`.
-   `preload.js` : pont securise entre le processus principal et le rendu (`window.electronAPI`).
-   `drivers/` : documentation et scripts d'installation des peripheriques (imprimante, lecteur de codes-barres, ecran client).

## Commandes

```bash
# Developpement (lancer d'abord `bun dev`, puis)
bun electron:dev

# Build du serveur Next.js
bun electron:build

# Creer l'installateur Windows (.exe)
bun electron:dist:win
```

## Windows 10

L'installateur NSIS genere `dist/Tradiz-<version>-win.exe`. Il peut etre distribue et installe sur un poste Windows 10/11.

La premiere fois, l'utilisateur doit configurer :

-   l'adresse IP de l'imprimante thermique dans les Parametres,
-   eventuellement executer `electron/drivers/install-printer-drivers.ps1` en tant qu'administrateur si l'imprimante est en USB avec un pilote generique.

## Deploiement automatique (GitHub Actions)

Le workflow `.github/workflows/build-windows-installer.yml` :

-   compile l'application sur un runner Windows a chaque `push` sur `main` et fournit le `.exe` en artefact,
-   lors d'une **Release GitHub** publiee, il attache l'installateur et le metadonnees `latest.yml` a la release,
-   `dist/standalone` est dedouble avant packaging pour eviter les liens symboliques crees par Next.js.

## Mises a jour automatiques (Windows)

L'application Electron Windows verifie au demarrage les dernieres releases GitHub du depot `flodef/Tradiz`. Si une version plus recente est disponible, elle propose automatiquement de telecharger et installer la mise a jour.

## Peripheriques

-   **Imprimante thermique** : ESC/POS compatible, port reseau 9100 (Epson par defaut).
-   **Lecteur de codes-barres** : clavier USB, envoie les chiffres suivis d'un `Enter`.
-   **Ecran client** : fenetre secondaire Electron que l'on peut deplacer sur un second ecran ou afficheur VFD/LCD.
