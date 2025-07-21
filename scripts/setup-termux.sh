#!/bin/bash

# Script pour configurer Termux et Bun sur une tablette Android

# Arrêter en cas d'erreur
set -e

# Accorder les permissions de stockage à Termux
#echo "Accord des permissions de stockage à Termux..."
#termux-setup-storage

# Mettre à jour et mettre à niveau les paquets Termux
echo "Mise à jour des paquets Termux..."
pkg update && pkg upgrade -y

# Installer nodejs
echo "Installation de nodejs..."
pkg install nodejs

# Installer git
echo "Installation de git..."
pkg install git -y

echo "Configuration terminée ! Exécutez le script 'run-app.sh' pour cloner et démarrer l'application."