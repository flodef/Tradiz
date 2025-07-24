#!/bin/bash

# Script pour ouvrir l'application dans le navigateur par défaut
# Variables de configuration
PORT=3000

# Arrêter en cas d'erreur
set -e

cd $HOME

# Charger le nom d'utilisateur depuis le fichier de configuration
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
else
  bash ~/setup-termux.sh
  wait
  exit 1
fi

# Ouvrir l'application dans le navigateur par défaut
termux-open-url "http://localhost:$PORT/$USERNAME"

# Afficher un message de confirmation
clear
echo "L'application est en cours d'exécution !"
echo "- Pour relancer le serveur, tappez : bash run-app.sh (puis appuyez sur Entrée)"
echo "- Pour quitter l'application, tappez : exit (puis appuyez sur Entrée)"