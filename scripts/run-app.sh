#!/bin/bash

# Script pour configurer Termux et exécuter l'application Next.js avec support d'impression

# Arrêter en cas d'erreur
set -e

# Variables de configuration
REPO_URL="https://github.com/flodef/Tradiz.git"
APP_DIR="$HOME/Tradiz"
PORT=3000

# Mettre à jour et mettre à niveau les paquets Termux
echo "Mise à jour des paquets Termux..."
pkg update && pkg upgrade -y

# Installer nodejs
echo "Installation de nodejs..."
pkg install nodejs -y

# Installer git
echo "Installation de git..."
pkg install git -y

# Cloner ou mettre à jour le dépôt
if [ -d "$APP_DIR" ]; then
  echo "Mise à jour du dépôt dans $APP_DIR..."
  cd "$APP_DIR"
  git pull origin main
  cd -
else
  echo "Clonage du dépôt depuis $REPO_URL..."
  git clone "$REPO_URL" "$APP_DIR"
fi

# Naviguer vers le répertoire de l'application
cd "$APP_DIR"

# Installer les dépendances
echo "Installation des dépendances..."
npm install

# Construire l'application Next.js
echo "Construction de l'application Next.js..."
npm run build

# Démarrer le serveur Next.js
echo "Démarrage du serveur Next.js sur http://localhost:$PORT..."
npm run start &

# Attendre quelques secondes pour que le serveur démarre
sleep 5

# Ouvrir l'application dans le navigateur par défaut
echo "Ouverture de l'application dans le navigateur..."
termux-open-url "http://localhost:$PORT"

echo "L'application est en cours d'exécution ! Utilisez l'application dans le navigateur pour imprimer."
echo "Pour arrêter le serveur, exécutez : pkill -f node"