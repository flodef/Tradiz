#!/bin/bash

# Script pour configurer Termux et Bun sur une tablette Android

# Arrêter en cas d'erreur
set -e

# Accorder les permissions de stockage à Termux
echo "Accord des permissions de stockage à Termux..."
termux-setup-storage

# Mettre à jour et mettre à niveau les paquets Termux
echo "Mise à jour des paquets Termux..."
pkg update && pkg upgrade -y

# Installer curl
echo "Installation de curl..."
pkg install curl -y

# Installer Bun
echo "Installation de Bun..."
curl -fsSL https://bun.sh/install | bash

# Ajouter Bun au PATH
echo "Ajout de Bun au PATH..."
export PATH=$PATH:$HOME/.bun/bin
echo 'export PATH=$PATH:$HOME/.bun/bin' >> ~/.bashrc
source ~/.bashrc

# Vérifier l'installation de Bun
echo "Vérification de l'installation de Bun..."
bun --version

# Installer git
echo "Installation de git..."
pkg install git -y

echo "Configuration terminée ! Exécutez le script 'run-app.sh' pour cloner et démarrer l'application."