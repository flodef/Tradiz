#!/bin/bash

# Script pour exécuter l'application Next.js avec support d'impression

# Démarrer le serveur Next.js
echo "Démarrage du serveur Next.js sur http://localhost:$PORT..."
npm run start &

# Attendre quelques secondes pour que le serveur démarre
sleep 5

# Ouvrir l'application dans le navigateur par défaut
echo "Ouverture de l'application dans le navigateur..."
termux-open-url "http://localhost:$PORT/$USERNAME"

echo "L'application est en cours d'exécution ! Utilisez l'application dans le navigateur pour imprimer."
echo "Pour arrêter le serveur, exécutez : pkill -f node"