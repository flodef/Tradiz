#!/bin/bash

echo "debug 0"

# Script pour ouvrir l'application dans le navigateur par défaut
# Variables de configuration
PORT=3000

echo "debug 1"

# Arrêter en cas d'erreur
set -e

echo "debug 2"

cd $HOME

echo "debug 3"

# Charger le nom d'utilisateur depuis le fichier de configuration
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
else
  bash ~/setup-termux.sh
  wait
  exit 1
fi

echo "debug 4"

# Ouvrir l'application dans le navigateur par défaut
echo "Ouverture de l'application dans le navigateur..."
termux-open-url "http://localhost:$PORT/$USERNAME"

# Afficher un message de confirmation
clear

echo "debug 5"

echo "L'application est en cours d'exécution !"
echo "- Pour relancer le serveur, tappez : bash run-app.sh (puis appuyez sur Entrée)"
echo "- Pour quitter l'application, tappez : exit (puis appuyez sur Entrée)"