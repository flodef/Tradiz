#!/bin/bash

echo "debug 0"

# Script pour cloner, construire et exécuter l'application Next.js avec support d'impression
# Variables de configuration
REPO_URL="https://github.com/flodef/Tradiz.git"
APP_DIR="$HOME/Tradiz"
echo "debug 1"
# Arrêter en cas d'erreur
set -e
echo "debug 2"
# Charger le nom d'utilisateur depuis le fichier de configuration
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
echo "debug 3"
else
  bash ~/setup-termux.sh
  wait
echo "debug 4"
  exit 1
fi
echo "debug 5"
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
echo "debug 6"
# Naviguer vers le répertoire de l'application
cd "$APP_DIR"
echo "debug 7"
# Gérer le fichier .env.local
if [ ! -f .env.local ]; then
  if mv ~/storage/downloads/.env.local .env.local 2>/dev/null; then
    echo "Fichier .env.local copié depuis ~/storage/downloads"
  else
    if [ ! -d ~/storage ]; then
      clear
      echo "Le dossier de stockage n'existe pas."
      echo "Voulez-vous remplir le fichier de paramétrage manuellement ? (o/n)"
      read -r response
      if [ "$response" = "o" ]; then
        echo "Vous pouvez créer le fichier manuellement dans Tradiz/.env.local en utilisant un éditeur de fichiers."
        cp .env.local.example .env.local
        nano .env.local
      else
        echo "Vous pouvez télécharger votre propre fichier en utilisant termux-setup-storage."
      fi
    else
      echo "Le fichier n'a pas été trouvé. Le fichier doit être nommé .env.local et se trouver dans le dossier Téléchargements."
    fi
    echo "Le fichier .env.local est requis pour continuer. Veuillez créer ou copier le fichier et réexécuter le script."
    exit 1
  fi
fi
echo "debug 8"
# Installer les dépendances
echo "Installation des dépendances..."
npm install
echo "debug 9"
# Construire l'application Next.js
echo "Construction de l'application Next.js..."
npm run build
echo "debug 10"
# Exécuter run-app.sh
echo "Démarrage de l'application..."
bash ~/run-app.sh
