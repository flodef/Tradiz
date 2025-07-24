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

# Installer python
#echo "Installation de python..."
#pkg install python -y

# Installer nano
echo "Installation de nano..."
pkg install nano -y

# Télécharger install-app.sh
curl -s -L https://raw.githubusercontent.com/flodef/Tradiz/main/scripts/install-app.sh -o ~/install-app.sh
chmod +x ~/install-app.sh

# Télécharger run-app.sh
curl -s -L https://raw.githubusercontent.com/flodef/Tradiz/main/scripts/run-app.sh -o ~/run-app.sh
chmod +x ~/run-app.sh

# Télécharger tradiz.sh
curl -s -L https://raw.githubusercontent.com/flodef/Tradiz/main/scripts/tradiz.sh -o ~/tradiz.sh
chmod +x ~/tradiz.sh

# Créer un raccourci pour utiliser les widgets
mkdir -p ~/.shortcuts
cp ~/tradiz.sh ~/.shortcuts/tradiz.sh

# Gérer le nom d'utilisateur
clear
if [ -f ~/.tradiz_config ]; then
  source ~/.tradiz_config
  echo "Nom d'utilisateur actuel : $USERNAME"
  echo "Voulez-vous changer le nom d'utilisateur ? (o/n)"
  read -r response
  if [ "$response" = "o" ]; then
    echo "Veuillez entrer votre nouveau nom d'utilisateur Tradiz :"
    read -r USERNAME
    echo "USERNAME=$USERNAME" > ~/.tradiz_config
  fi
else
  echo "Veuillez entrer votre nom d'utilisateur Tradiz :"
  read -r USERNAME
  echo "USERNAME=$USERNAME" > ~/.tradiz_config
fi

# Exécuter install-app.sh
bash install-app.sh