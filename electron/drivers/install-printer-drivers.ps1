<#
.SYNOPSIS
    Installe une imprimante thermique ESC/POS reseau pour Tradiz sous Windows.

.DESCRIPTION
    Cree une imprimante locale "Generic / Text Only" pointant vers le port TCP 9100
    de l'imprimante designee. Cette imprimante peut ensuite etre utilisee par
    l'application de bureau Tradiz.

.PARAMETER PrinterIP
    Adresse IP de l'imprimante thermique sur le reseau local.

.PARAMETER PortName
    Nom du port TCP/IP a creer (par defaut : IP_<PrinterIP>).

.PARAMETER PrinterName
    Nom de l'imprimante locale a creer (par defaut : Tradiz Thermal Printer).
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PrinterIP,

    [string]$PortName = "",

    [string]$PrinterName = "Tradiz Thermal Printer"
)

if ([string]::IsNullOrWhiteSpace($PortName)) {
    $PortName = "IP_$PrinterIP"
}

Write-Host "Configuration de l'imprimante $PrinterName sur $PrinterIP`:9100 ..."

# Verifier les droits administrateur
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Ce script doit etre execute en tant qu'administrateur."
    exit 1
}

# Creer le port TCP/IP s'il n'existe pas
$port = Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue
if (-not $port) {
    Add-PrinterPort -Name $PortName -PrinterHostAddress $PrinterIP -PortNumber 9100 -ErrorAction Stop
    Write-Host "Port $PortName cree."
} else {
    Write-Host "Le port $PortName existe deja."
}

# Ajouter l'imprimante avec le pilote generique texte
$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
    Add-Printer -Name $PrinterName -DriverName "Generic / Text Only" -PortName $PortName -ErrorAction Stop
    Write-Host "Imprimante '$PrinterName' installee avec succes."
} else {
    Write-Host "L'imprimante '$PrinterName' existe deja."
}

Set-Printer -Name $PrinterName -Shared $false -Published $false
Write-Host "Installation terminee."
