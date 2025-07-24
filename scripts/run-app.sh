#!/bin/bash

# Script pour exécuter l'application Next.js avec support d'impression
# Variables de configuration
APP_DIR="$HOME/Tradiz"

# Arrêter en cas d'erreur
set -e

# Charger le nom d'utilisateur depuis le fichier de configuration
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
else
  bash ~/setup-termux.sh
  wait
  exit 1
fi

# Naviguer vers le répertoire de l'application
cd "$APP_DIR"

# Démarrer le serveur Next.js
echo "Démarrage du serveur Next.js..."
npm run start &

# Attendre quelques secondes pour que le serveur démarre
sleep 5

# Exécuter tradiz.sh
echo "Lancement de l'application..."
bash ~/tradiz.sh
