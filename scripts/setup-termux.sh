#!/bin/bash

# Script pour configurer Termux et Node.js sur une tablette Android

# Arrêter en cas d'erreur
set -e

# Mettre à jour et mettre à niveau les paquets Termux
echo "Mise à jour des paquets Termux..."
pkg update && pkg upgrade -y

# Installer nodejs
echo "Installation de nodejs..."
pkg install nodejs-lts -y

# Installer git
echo "Installation de git..."
pkg install git -y

# Installer nano
echo "Installation de nano..."
pkg install nano -y

# Demander le nom d'utilisateur
echo "Veuillez entrer votre nom d'utilisateur Tradiz :"
read -r USERNAME

# Stocker le nom d'utilisateur dans un fichier de configuration
echo "USERNAME=$USERNAME" > ~/.tradiz_config


#!/bin/bash
curl -s -L https://raw.githubusercontent.com/flodef/Tradiz/main/scripts/termux-widget.sh -o termux-widget.sh
chmod +x termux-widget.sh

# Télécharger et exécuter run-app.sh
curl -s -L https://raw.githubusercontent.com/flodef/Tradiz/main/scripts/run-app.sh -o run-app.sh
chmod +x run-app.sh
bash run-app.sh