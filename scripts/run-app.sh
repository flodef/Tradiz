#!/bin/bash

# Script pour exécuter l'application Next.js avec support d'impression

# Arrêter le serveur Next.js en cours
pkill -f node

# Démarrer le serveur Next.js
echo "Démarrage du serveur Next.js sur http://localhost:$PORT..."
npm run start &

# Attendre quelques secondes pour que le serveur démarre
sleep 5

# Ouvrir l'application dans le navigateur par défaut
echo "Ouverture de l'application dans le navigateur..."
termux-open-url "http://localhost:$PORT/$USERNAME"

echo "L'application est en cours d'exécution !"
echo "Pour arrêter le serveur, exécutez : pkill -f node"