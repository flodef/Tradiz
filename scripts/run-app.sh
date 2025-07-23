#!/data/data/com.termux/files/usr/bin/bash

# Source le fichier ~/.bashrc pour charger les variables d'environnement
source ~/.bashrc
export PATH=$PATH:$HOME/.node/bin:/data/data/com.termux/files/usr/bin

# Script pour exécuter l'application Next.js avec support d'impression
# Variables de configuration
APP_DIR="$HOME/Tradiz"
PORT=3000

# Arrêter le serveur Next.js en cours
pkill -f npm

# Charger le nom d'utilisateur depuis le fichier de configuration
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
else
  echo "Erreur : Fichier de configuration ~/.tradiz_config introuvable. Exécutez setup-termux.sh d'abord."
  exit 1
fi

# Naviguer vers le répertoire de l'application
cd "$APP_DIR"

# Démarrer le serveur Next.js
echo "Démarrage du serveur Next.js sur http://localhost:$PORT..."
npm run start &

# Attendre quelques secondes pour que le serveur démarre
sleep 5

# Ouvrir l'application dans le navigateur par défaut
echo "Ouverture de l'application dans le navigateur..."
termux-open-url "http://localhost:$PORT/$USERNAME"

# Afficher un message de confirmation
clear
echo "L'application est en cours d'exécution !"
echo "Pour arrêter le serveur, exécutez : pkill -f npm"