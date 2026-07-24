# Pilotes et configuration matérielle

Ce dossier contient les ressources destinées à l'installation et à la configuration du matériel périphérique utilisé avec l'application de bureau Tradiz (Electron).

## Imprimantes thermiques

L'application utilise le module `node-thermal-printer` pour communiquer en mode réseau (TCP/IP, port 9100) avec les imprimantes ESC/POS compatibles (Epson, etc.).

### Prérequis Windows

1. Brancher l'imprimante au réseau local (câble Ethernet ou WiFi) et noter son adresse IP.
2. Dans les **Paramètres** de l'application, renseigner l'adresse IP de l'imprimante.
3. Si l'imprimante est connectée en USB, installer le pilote fourni par le constructeur et configurer un port TCP redirigé, ou utiliser un convertisseur USB/Ethernet.

### Installation rapide via PowerShell

Ouvrir PowerShell en tant qu'administrateur et exécuter :

```powershell
.\install-printer-drivers.ps1 -PrinterIP "192.168.1.50"
```

Le script installe une imprimante locale **Generic / Text Only** redirigée vers le port standard TCP 9100 de l'imprimante réseau.

## Lecteur de codes-barres

La plupart des lecteurs USB fonctionnent en mode clavier HID. L'application détecte automatiquement une séquence rapide de chiffres suivie d'un retour chariot et déclenche l'action correspondante (produit, client ou employé).

Aucun pilote supplémentaire n'est nécessaire. Brancher le lecteur, le configurer en mode **Clavier USB** avec un suffixe `Enter`, puis scanner un code-barres.

## Écran client / mini écran

L'application Electron peut ouvrir une fenêtre secondaire dédiée à l'affichage client (total, monnaie, message). Cette fenêtre peut être déplacée vers l'écran secondaire (écran tactile ou afficheur VFD/LCD connecté en HDMI/VGA).

Pour l'activer, utiliser le hook `useMiniScreen` ou, depuis le menu de l'application de bureau, sélectionner **Afficher l'écran client**.
