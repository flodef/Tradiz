#!/bin/bash

# Script pour cloner, construire et exécuter l'application Next.js avec support d'impression

# Arrêter en cas d'erreur
set -e

# Charger le nom d'utilisateur depuis le fichier de configuration
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
else
  echo "Erreur : Fichier de configuration ~/.tradiz_config introuvable. Exécutez setup.sh d'abord."
  exit 1
fi

# Variables de configuration
REPO_URL="https://github.com/flodef/Tradiz.git"
APP_DIR="$HOME/Tradiz"
PORT=3000

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
        echo "Vous pouvez télécharger votre propre fichier en utilisant termux-setup-storage."
      else
        echo "Vous pouvez créer le fichier manuellement dans Tradiz/.env.local en utilisant un éditeur de fichiers."
        cp .env.local.example .env.local
        nano .env.local
      fi
    else
      echo "Le fichier n'a pas été trouvé. Le fichier doit être nommé .env.local et se trouver dans le dossier Téléchargements."
    fi
    echo "Le fichier .env.local est requis pour continuer. Veuillez créer ou copier le fichier et réexécuter le script."
    exit 1
  fi
fi

# Installer les dépendances
echo "Installation des dépendances..."
npm install

# Construire l'application Next.js
echo "Construction de l'application Next.js..."
npm run build

# Exécuter run-app.sh
echo "Démarrage de l'application..."
bash ~/run-app.sh
