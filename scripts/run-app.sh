#!/bin/bash

# Script pour cloner, construire et exécuter l'application Next.js avec support d'impression

# Arrêter en cas d'erreur
set -e

# Variables de configuration
REPO_URL="https://github.com/flodef/Tradiz.git" # Remplacez par l'URL de votre dépôt
APP_DIR="$HOME/Tradiz" # Remplacez par le nom de votre dépôt
PRINTER_IP="192.168.1.100" # Remplacez par l'adresse IP de votre imprimante
PRINTER_PORT="9100" # Par défaut pour la plupart des imprimantes thermiques
PORT=3000 # Port pour le serveur Next.js

# Cloner le dépôt
echo "Clonage du dépôt depuis $REPO_URL..."
git clone "$REPO_URL" "$APP_DIR"

# Naviguer vers le répertoire de l'application
cd "$APP_DIR"

# Installer les dépendances
echo "Installation des dépendances..."
bun install

# Vérifier la connectivité de l'imprimante
# echo "Test de la connectivité de l'imprimante à tcp://$PRINTER_IP:$PRINTER_PORT..."
# cat << EOF > test-printer.js
# const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

# async function testPrinter() {
#   const printer = new ThermalPrinter({
#     type: PrinterTypes.EPSON, // Ajustez si votre imprimante utilise STAR ou un autre type
#     interface: 'tcp://$PRINTER_IP:$PRINTER_PORT',
#     options: { timeout: 5000 },
#   });

#   try {
#     const isConnected = await printer.isPrinterConnected();
#     console.log('Imprimante connectée :', isConnected);
#     if (isConnected) {
#       printer.println('Test d\'impression depuis Termux');
#       printer.cut();
#       await printer.execute();
#       console.log('Test d\'impression envoyé');
#     } else {
#       console.error('Imprimante non connectée');
#       process.exit(1);
#     }
#   } catch (error) {
#     console.error('Erreur :', error.message);
#     process.exit(1);
#   }
# }

# testPrinter();
# EOF

# bun test-printer.js || {
#   echo "Le test de l'imprimante a échoué. Vérifiez l'adresse IP ($PRINTER_IP) et le port ($PRINTER_PORT)."
#   echo "Assurez-vous que la tablette et l'imprimante sont sur le même réseau Wi-Fi."
#   exit 1
# }

# Construire l'application Next.js
echo "Construction de l'application Next.js..."
bun run build

# Démarrer le serveur Next.js
echo "Démarrage du serveur Next.js sur http://localhost:$PORT..."
bun .next/standalone/server.js &

# Attendre quelques secondes pour que le serveur démarre
sleep 5

# Ouvrir l'application dans le navigateur par défaut
echo "Ouverture de l'application dans le navigateur..."
termux-open-url "http://localhost:$PORT"

echo "L'application est en cours d'exécution ! Utilisez l'application dans le navigateur pour imprimer."
echo "Pour arrêter le serveur, exécutez : killall bun"