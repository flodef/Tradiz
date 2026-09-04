'use server';

import { CharacterSet, PrinterTypes, ThermalPrinter } from 'node-thermal-printer';
import { networkInterfaces } from 'os';
import { execSync } from 'child_process';
import fs from 'fs';
import { Shop } from '../contexts/ConfigProvider';
import {
    isProcessingTransaction,
    isRefundTransaction,
    isRemovedTransaction,
    isWaitingTransaction,
} from '../contexts/dataProvider/transactionHelpers';
import { ReceiptData } from '../hooks/usePay';
import { SummaryData } from '../hooks/useSummary';
import { DEFAULT_VAT_RATE, IS_DEV, NF525_CERTIFICATE_NUMBER } from './constants';
import { formatFrenchDate, generateReceiptNumber } from './date';
import './extensions'; // Registers Number.prototype.toCurrency used by toCurrency() below
import { BillingReport, Currency, SERVICE_TYPE_LABELS, ServiceType, Transaction } from './interfaces';
import { createMockPrinter } from './mockPrinter';

type PrintResponse = {
    success?: boolean;
    error?: string;
};

const COM_PORT_REGEX = /^COM\d+$/i;

function isComPort(address: string): boolean {
    return COM_PORT_REGEX.test(address.trim());
}

/**
 * Resolves a printer address to a full IP.
 * - COM ports are returned as-is (e.g. "COM1")
 * - Full IPs are returned as-is (e.g. "192.168.1.195")
 * - Last-octet numbers (e.g. "195") are expanded to full IP using the local subnet
 */
function resolvePrinterAddress(address: string): string {
    const trimmed = address.trim();
    if (isComPort(trimmed)) return trimmed;
    // If it looks like a full IP (contains dots), return as-is
    if (trimmed.includes('.')) return trimmed;
    // Otherwise treat as last octet and build full IP from local subnet
    const localIp = getLocalIp();
    if (!localIp) return trimmed;
    const parts = localIp.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.${trimmed}`;
}

/**
 * Configures a Windows COM port's serial parameters before writing.
 *
 * fs.openSync() on a COM port does NOT configure baud rate, parity, data bits,
 * stop bits or flow control — it inherits whatever the port is currently set to.
 * If those don't match the printer, every byte is misinterpreted, producing
 * gibberish output and unparseable ESC/POS commands (drawer never fires).
 *
 * The Windows `mode` command configures the port without needing the serialport
 * native module (which isn't bundled in the Next.js standalone server).
 *
 * Baud rate defaults to 9600 (the most common thermal printer default) and can be
 * overridden with TRADIZ_PRINTER_BAUDRATE.
 */
function configureComPort(comPort: string, baudRate?: number): void {
    const port = comPort.trim().toUpperCase();
    const baud = baudRate ? String(baudRate) : process.env.TRADIZ_PRINTER_BAUDRATE || '9600';
    // to=off: no timeout, dtr/rts=on: assert control lines so the printer sees us,
    // xon=off: no software flow control (ESC/POS is binary — XON/XOFF would eat 0x11/0x13 bytes)
    const cmd = `mode ${port}: BAUD=${baud} PARITY=N DATA=8 STOP=1 to=off xon=off odsr=off octs=off dtr=on rts=on`;
    try {
        execSync(cmd, { stdio: 'pipe', windowsHide: true });
        console.log(`[PRINTER] Configured ${port} (${cmd})`);
    } catch (err) {
        // Non-fatal: the port may already be correctly configured, or `mode` may be
        // unavailable. Log and continue so printing is still attempted.
        console.warn(`[PRINTER] Could not configure ${port}: ${(err as Error).message}`);
    }
}

/**
 * Writes a raw buffer to a COM port using fs (Windows only).
 * Works without the serialport native module.
 *
 * COM port writes are serialized via a promise chain to prevent concurrent
 * access (e.g. receipt print + cash drawer command at the same time), which
 * corrupts the output and prevents the drawer from opening.
 */
let comPortWriteChain: Promise<void> = Promise.resolve();

function writeToComPort(comPort: string, buffer: Buffer, baudRate?: number): Promise<void> {
    const path = '\\\\.\\' + comPort.trim().toUpperCase();
    const run = () =>
        new Promise<void>((resolve, reject) => {
            configureComPort(comPort, baudRate);
            console.log(`[PRINTER] Opening ${path} for writing, buffer size: ${buffer.length} bytes`);
            let fd: number;
            try {
                fd = fs.openSync(/*turbopackIgnore: true*/ path, 'r+');
            } catch (err) {
                const code = (err as NodeJS.ErrnoException).code;
                if (code === 'ENOENT') {
                    reject(
                        new Error(`Port ${comPort} introuvable (COM ports sont disponibles sur Windows uniquement)`, {
                            cause: err as Error,
                        })
                    );
                    return;
                }
                reject(err as Error);
                return;
            }
            try {
                fs.writeSync(fd, buffer, 0, buffer.length, null);
                console.log(`[PRINTER] Wrote ${buffer.length} bytes to ${comPort}`);
            } finally {
                fs.closeSync(fd);
                console.log(`[PRINTER] Closed ${comPort}`);
            }
            resolve();
        });
    // Chain this write after any previous COM port write completes.
    comPortWriteChain = comPortWriteChain.then(run, run);
    return comPortWriteChain;
}

/**
 * Executes the print: if the printer has a _comPort attached, writes the
 * ESC/POS buffer directly to the COM port via fs. Otherwise, uses the
 * normal TCP/IP execute() method.
 */
async function executePrint(printer: ThermalPrinter): Promise<void> {
    const comPort = (printer as unknown as { _comPort?: string })._comPort;
    if (comPort) {
        const comBaud = (printer as unknown as { _comBaud?: number })._comBaud;
        const buffer = printer.getBuffer();
        await writeToComPort(comPort, buffer, comBaud);
        return;
    }
    await printer.execute();
}

/**
 * Checks if the printer is on the same subnet as the device, or a COM port
 */
const initPrinter = async (printerAddresses: string[], comBaud?: number) => {
    // If in DEV mode, return a mock printer that prints to the console
    if (IS_DEV) return { printer: await createMockPrinter() };

    // Resolve addresses (last-octet → full IP) and find COM port
    const resolved = printerAddresses.map(resolvePrinterAddress);

    // Try COM port first (serial printer)
    const comPort = resolved.find((addr) => isComPort(addr));
    if (comPort) {
        try {
            const printer = new ThermalPrinter({
                type: PrinterTypes.EPSON,
                interface: 'COM', // dummy, we won't call execute()
                width: 48,
                characterSet: CharacterSet.PC858_EURO,
                removeSpecialCharacters: false,
                lineCharacter: '-',
            });
            // Attach COM port info so executePrint knows to use fs
            (printer as unknown as { _comPort: string })._comPort = comPort.trim().toUpperCase();
            if (comBaud) (printer as unknown as { _comBaud?: number })._comBaud = comBaud;
            return { printer };
        } catch (err) {
            return { error: "Impossible d'ouvrir le port " + comPort + ': ' + (err as Error).message };
        }
    }

    // Normal printer initialization for production (TCP/IP)
    const myIp = getLocalIp();
    if (!myIp) return { error: "Vous n'êtes pas sur un réseau local" };
    const connectedPrinterIPAddress = resolved.find((address) => !isComPort(address) && isSameSubnet(myIp, address));
    if (!connectedPrinterIPAddress) return { error: 'Aucune imprimante connectée sur le même réseau que ' + myIp };

    const printer = await getPrinter(connectedPrinterIPAddress);
    if (!printer) return { error: 'Imprimante non connectée sur ' + connectedPrinterIPAddress };
    return { printer };
};

/**
 * Creates a printer instance and checks connection (TCP/IP only)
 */
const getPrinter = async (printerIPAddress: string) => {
    const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: 'tcp://' + printerIPAddress + ':9100',
        width: 48, // 48 characters per line
        characterSet: CharacterSet.PC858_EURO,
        removeSpecialCharacters: false,
        lineCharacter: '-',
    });
    const isConnected = await printer.isPrinterConnected();
    return isConnected ? printer : null;
};

/**
 * Helper function to get local IP
 */
function getLocalIp() {
    const interfaces = networkInterfaces();
    let localIp = null;

    for (const name of Object.keys(interfaces)) {
        if (interfaces[name]) {
            for (const iface of interfaces[name]) {
                if (
                    iface.family === 'IPv4' &&
                    !iface.internal &&
                    (iface.address.startsWith('192.168.') || iface.address.startsWith('10.10.'))
                ) {
                    localIp = iface.address;
                    break;
                }
            }
            if (localIp) break;
        }
    }
    return localIp;
}

/**
 * Helper function to check if two IPs are on the same subnet
 */
function isSameSubnet(ip1: string, ip2: string, subnetMask = '255.255.255.0') {
    // Convert IPs to arrays of octets
    const ip1Octets = ip1.split('.').map(Number);
    const ip2Octets = ip2.split('.').map(Number);
    const maskOctets = subnetMask.split('.').map(Number);

    // Calculate network address for each IP using bitwise AND
    const network1 = ip1Octets.map((octet, i) => octet & maskOctets[i]);
    const network2 = ip2Octets.map((octet, i) => octet & maskOctets[i]);

    // Compare network addresses
    return network1.every((octet, i) => octet === network2[i]);
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

function printReceiptHeader(printer: ThermalPrinter, shop: Shop) {
    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(shop.name.toUpperCase());
    printer.bold(false);
    printer.setTextNormal();
    if (shop.address) printer.println(shop.address);
    if (shop.zipCode && shop.city) printer.println(shop.zipCode + ' ' + shop.city);
    if (shop.country) printer.println(shop.country);
    if (shop.phone) printer.println('Tél : ' + shop.phone);
    if (shop.email) printer.println(shop.email);
    printer.newLine();
}

function printReceiptFooter(printer: ThermalPrinter, shop: Shop, validator?: string) {
    printer.alignCenter();
    if (shop.serial) printer.println('SIRET ' + shop.serial + ' - NAF 5610C');
    if (shop.vatNumber) printer.println('TVA Intracom ' + shop.vatNumber);
    printer.println('SARL - RCS');
    printer.println(`Tradiz v${APP_VERSION} - Certif. ${NF525_CERTIFICATE_NUMBER}`);
    if (validator) printer.println('Service : ' + validator);
    printer.println('Caisse 1');
    printer.newLine();
    printer.println('Merci de votre visite');
}

function printInternalHeader(printer: ThermalPrinter, shop: Shop) {
    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(shop.name.toUpperCase());
    printer.bold(false);
    printer.setTextNormal();
    if (shop.serial) printer.println('SIRET ' + shop.serial);
    printer.newLine();
}

const toCurrency = (amount: number | string, currency: Currency) =>
    Number(
        amount
            .toString()
            .replace(/[^0-9.,\- ]/g, '')
            .trim()
    ).toCurrency(currency.decimals, currency.symbol);

/**
 * Server action to print a receipt with standard formatting
 */
export async function printReceipt(
    printerAddresses: string[],
    receiptData: ReceiptData,
    comBaud?: number
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses, comBaud);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const receiptNumber = generateReceiptNumber('R', currentDate);
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        const paymentMethod =
            !isWaitingTransaction(receiptData.transaction) && !isProcessingTransaction(receiptData.transaction)
                ? receiptData.transaction.method
                : undefined;
        const currency = receiptData.currency;

        // Print header
        printReceiptHeader(printer, receiptData.shop);
        printer.drawLine();

        // Print customer block if available
        if (receiptData.customer) {
            printer.alignLeft();
            const custName = `${receiptData.customer.firstName} ${receiptData.customer.lastName}`.trim();
            printer.println(custName);
            if (receiptData.company?.address) printer.println(receiptData.company.address);
            if (receiptData.company?.zipCode && receiptData.company?.city)
                printer.println(receiptData.company.zipCode + ' ' + receiptData.company.city);
            if (receiptData.customer.reference) printer.println(`Compte n° ${receiptData.customer.reference}`);
        }

        printer.drawLine();
        printer.alignLeft();
        printer.println(`Date : ${frenchDateStr} - ${frenchTimeStr}`);

        const showDetails = receiptData.showDetails !== false; // default true
        const mealCount = receiptData.mealCount;
        const isJustificatif = mealCount !== undefined && mealCount > 0;

        if (isJustificatif) {
            // Justificatif format (no-detail receipt)
            printer.println(`Justificatif n° 1/1 Imp. N° 1`);
            if (receiptData.transaction.shortNumOrder) {
                printer.println(`${receiptData.transaction.shortNumOrder}-1 Tick du ${frenchDateStr}-${frenchTimeStr}`);
            }
        } else {
            // Facturation format (detailed receipt)
            printer.println(`Reçu de facturation pour Facture n°${receiptNumber}`);
            if (isRefundTransaction(receiptData.transaction) && receiptData.transaction.shortNumOrder) {
                printer.println(`Annulation Facture n°${receiptData.transaction.shortNumOrder}`);
            }
        }
        if (receiptData.transaction.validator) printer.println(`Vendeur•se : ${receiptData.transaction.validator}`);
        printer.newLine();

        printer.drawLine();
        printer.alignLeft();

        if (mealCount && mealCount > 0) {
            // Justificatif: print meal count line with unit price
            const unitPrice = receiptData.transaction.amount / mealCount;
            printer.tableCustom([
                { text: `${mealCount} x`, align: 'LEFT', cols: 4 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'Repas complet(s)', align: 'LEFT', cols: 22 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: '', align: 'LEFT', cols: 7 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(unitPrice, currency), align: 'LEFT', cols: 8 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: '1', align: 'LEFT', cols: 3 },
            ]);
            printer.drawLine();
        } else {
            // Print items header
            printer.tableCustom([
                { text: 'Qté', align: 'LEFT', cols: 4 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'Désignation', align: 'LEFT', cols: 22 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'P.U', align: 'LEFT', cols: 7 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'Tot.TTC', align: 'LEFT', cols: 8 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'T', align: 'LEFT', cols: 3 },
            ]);
            printer.drawLine();

            // Print each item
            receiptData.transaction.products.forEach((item) => {
                let label = item.label;
                if (item.discount.amount > 0) {
                    label += ` (-${item.discount.amount}${item.discount.unit})`;
                }
                const labelLength = label.length;
                label = labelLength > 22 ? label.slice(0, 19) + '...' : label;

                // Determine VAT rate code (1=5.5%, 2=10%, 3=20%, etc.)
                const rawRate =
                    item.vatRate ??
                    receiptData.inventory?.find((inv) => inv.category === item.category)?.rate ??
                    DEFAULT_VAT_RATE;
                const vatRate = rawRate >= 1 ? rawRate / 100 : rawRate;
                const vatCode = vatRate === 0 ? '0' : vatRate <= 0.056 ? '1' : vatRate <= 0.11 ? '2' : '3';

                printer.tableCustom([
                    { text: `${item.quantity}`, align: 'LEFT', cols: 4 },
                    { text: '', align: 'LEFT', cols: 1 },
                    { text: label, align: 'LEFT', cols: 22 },
                    { text: '', align: 'LEFT', cols: 1 },
                    { text: toCurrency(item.amount, currency), align: 'LEFT', cols: 7 },
                    { text: '', align: 'LEFT', cols: 1 },
                    { text: toCurrency(item.total || 0, currency), align: 'LEFT', cols: 8 },
                    { text: '', align: 'LEFT', cols: 1 },
                    { text: vatCode, align: 'LEFT', cols: 3 },
                ]);

                // In detail mode, expand formula/article options as indented sub-lines
                if (showDetails && item.options) {
                    try {
                        const parsedOptions: Array<{ type: string; value: string; price: number }> = JSON.parse(
                            item.options
                        );
                        for (const opt of parsedOptions) {
                            const optLabel = `  ${opt.value}`;
                            const truncated = optLabel.length > 22 ? optLabel.slice(0, 19) + '...' : optLabel;
                            printer.tableCustom([
                                { text: '', align: 'LEFT', cols: 4 },
                                { text: '', align: 'LEFT', cols: 1 },
                                { text: truncated, align: 'LEFT', cols: 22 },
                                { text: '', align: 'LEFT', cols: 1 },
                                { text: '', align: 'LEFT', cols: 7 },
                                { text: '', align: 'LEFT', cols: 1 },
                                { text: '', align: 'LEFT', cols: 8 },
                                { text: '', align: 'LEFT', cols: 1 },
                                { text: '', align: 'LEFT', cols: 3 },
                            ]);
                        }
                    } catch {
                        // Not valid JSON options, skip
                    }
                }
            });
            printer.drawLine();
        }

        // Calculate totals by VAT rate
        const vatTotals = new Map<number, { ht: number; tva: number; ttc: number }>();
        let totalHT = 0;
        let totalTTC = 0;

        if (mealCount && mealCount > 0) {
            // No-detail receipt: compute VAT from the single total amount
            const vatRate = DEFAULT_VAT_RATE >= 1 ? DEFAULT_VAT_RATE / 100 : DEFAULT_VAT_RATE;
            const totalAmount = receiptData.transaction.amount;
            const totalAmountHT = totalAmount / (1 + vatRate);
            const totalAmountTVA = totalAmount - totalAmountHT;
            totalHT = totalAmountHT;
            totalTTC = totalAmount;
            vatTotals.set(vatRate, { ht: totalAmountHT, tva: totalAmountTVA, ttc: totalAmount });
        } else {
            receiptData.transaction.products.forEach((item) => {
                // Use item.vatRate if available, otherwise fall back to category rate, default to DEFAULT_VAT_RATE
                const rawRate =
                    item.vatRate ??
                    receiptData.inventory?.find((inv) => inv.category === item.category)?.rate ??
                    DEFAULT_VAT_RATE;

                // Normalize rate to decimal: values >= 1 are treated as percentages (e.g. 5.5 → 0.055, 20 → 0.20)
                const vatRate = rawRate >= 1 ? rawRate / 100 : rawRate;

                const itemTotalTTC = item.total || 0;
                const itemTotalHT = itemTotalTTC / (1 + vatRate);
                const itemTVA = itemTotalTTC - itemTotalHT;

                totalHT += itemTotalHT;
                totalTTC += itemTotalTTC;

                if (!vatTotals.has(vatRate)) {
                    vatTotals.set(vatRate, { ht: 0, tva: 0, ttc: 0 });
                }
                const current = vatTotals.get(vatRate)!;
                current.ht += itemTotalHT;
                current.tva += itemTVA;
                current.ttc += itemTotalTTC;
            });
        }

        // Print employer share as a negative line item in the items table
        const employerShare = receiptData.transaction.employerShare;
        const isRefund = isRefundTransaction(receiptData.transaction);
        if (employerShare && employerShare !== 0 && !(mealCount && mealCount > 0)) {
            const shareAmount = -Math.abs(employerShare);
            const shareQty = isRefund ? '-1' : '1';
            printer.tableCustom([
                { text: shareQty, align: 'LEFT', cols: 4 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'PART EMPLOYEUR', align: 'LEFT', cols: 22 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(shareAmount, currency), align: 'LEFT', cols: 7 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(shareAmount, currency), align: 'LEFT', cols: 8 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: '3', align: 'LEFT', cols: 3 },
            ]);
            printer.drawLine();
        }

        // Print fidelity points used as a negative line item
        const fidelityPointsUsed = receiptData.transaction.fidelityPointsUsed;
        if (fidelityPointsUsed && fidelityPointsUsed !== 0 && !(mealCount && mealCount > 0)) {
            const fidAmount = -Math.abs(fidelityPointsUsed);
            const fidQty = isRefund ? '-1' : '1';
            printer.tableCustom([
                { text: fidQty, align: 'LEFT', cols: 4 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: 'Fidélité', align: 'LEFT', cols: 22 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(fidAmount, currency), align: 'LEFT', cols: 7 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(fidAmount, currency), align: 'LEFT', cols: 8 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: '1', align: 'LEFT', cols: 3 },
            ]);
            printer.drawLine();
        }

        // Print article count (facturation only)
        if (!isJustificatif) {
            printer.alignLeft();
            const articleCount = receiptData.transaction.products.length;
            printer.println(`Nombre d'articles : ${articleCount}`);
        }

        // Print total TTC (larger and bold)
        const netAmount =
            employerShare && employerShare !== 0
                ? totalTTC - employerShare - (fidelityPointsUsed ?? 0)
                : totalTTC - (fidelityPointsUsed ?? 0);
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.leftRight(isJustificatif ? 'TOTAL TTC:' : 'NET TTC', toCurrency(netAmount, currency));
        printer.bold(false);
        printer.setTextNormal();
        printer.drawLine();

        // Add employer share as 0% VAT negative entry (for normal receipts)
        // or positive entry (for cancellation receipts where employerShare is negative)
        if (employerShare && employerShare !== 0) {
            const rate0 = 0;
            if (!vatTotals.has(rate0)) {
                vatTotals.set(rate0, { ht: -employerShare, tva: 0, ttc: -employerShare });
            } else {
                const v = vatTotals.get(rate0)!;
                v.ht -= employerShare;
                v.ttc -= employerShare;
            }
        }
        const totalHTFinal = totalHT - (employerShare ?? 0);

        // Print VAT breakdown table
        printer.alignLeft();
        printer.tableCustom([
            { text: 'Code TVA', align: 'LEFT', cols: 12 },
            { text: 'HT', align: 'LEFT', cols: 12 },
            { text: 'TVA', align: 'LEFT', cols: 12 },
            { text: 'TTC', align: 'LEFT', cols: 12 },
        ]);

        Array.from(vatTotals.keys())
            .sort((a, b) => a - b)
            .forEach((rate) => {
                const values = vatTotals.get(rate)!;
                const code = rate === 0 ? '0' : rate <= 0.056 ? '1' : rate <= 0.11 ? '2' : '3';
                const rateStr = isJustificatif ? (rate * 100).toFixed(2) : (rate * 100).toFixed(2) + '%';
                printer.tableCustom([
                    { text: `(${code}) ${rateStr}`, align: 'LEFT', cols: 12 },
                    { text: toCurrency(values.ht, currency), align: 'LEFT', cols: 12 },
                    { text: toCurrency(values.tva, currency), align: 'LEFT', cols: 12 },
                    { text: toCurrency(values.ttc, currency), align: 'LEFT', cols: 12 },
                ]);
            });

        printer.leftRight(isJustificatif ? 'TOTAL. HT' : 'TOTAL HT', toCurrency(totalHTFinal, currency));

        if (isJustificatif) {
            // Justificatif: payment line + non-valable notice
            printer.newLine();
            if (paymentMethod) {
                printer.leftRight(`(B) ${paymentMethod}`, toCurrency(netAmount, currency));
            }
            printer.newLine();
            printer.alignCenter();
            printer.println('Justificatif non valable pour encaissement');
        } else {
            // Facturation: solde créditeur + payment method
            printer.println('A la date de facturation');
            printer.leftRight('Solde Créditeur', toCurrency(netAmount, currency));
            printer.newLine();

            // Print payment method if available
            printer.alignCenter();
            printer.println(paymentMethod ? `Mode de paiement: ${paymentMethod}` : 'À RÉGLER');

            // Print cash details and change for cash payments
            if (receiptData.transaction.cashAmount !== undefined) {
                printer.leftRight('MONTANT REÇU', toCurrency(receiptData.transaction.cashAmount, currency));
                if (receiptData.transaction.change !== undefined && receiptData.transaction.change > 0) {
                    printer.leftRight('MONNAIE À RENDRE', toCurrency(receiptData.transaction.change, currency));
                }
            }
        }

        printer.newLine();

        // Print legal footer
        printReceiptFooter(printer, receiptData.shop, receiptData.transaction.validator);

        printer.cut();

        // Execute print
        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print receipt:', error);
        return {
            error: `Erreur lors de l'impression du reçu: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Server action to print a kitchen ticket with large font for products
 */
export async function printKitchenTicket(
    printerAddresses: string[],
    ticketData: { transaction: Transaction; serviceType?: ServiceType }
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);
        const isRefund = isRefundTransaction(ticketData.transaction);
        const isRemoved = isRemovedTransaction(ticketData.transaction);
        const serviceType = ticketData.serviceType;

        // Date and time
        printer.alignLeft();
        printer.println(`${frenchDateStr} ${frenchTimeStr}`);

        // Customer name if any
        if (ticketData.transaction.customerName) {
            printer.println(`Client : ${ticketData.transaction.customerName}`);
        }

        printer.newLine();

        // Service type or refund/delete in big bold font
        printer.setTextDoubleHeight();
        printer.bold(true);
        if (isRefund) {
            printer.println('REMBOURSEMENT');
        } else if (isRemoved) {
            printer.println('ANNULATION');
        } else if (serviceType) {
            printer.println(SERVICE_TYPE_LABELS[serviceType].toUpperCase());
        }
        printer.bold(false);
        printer.setTextNormal();
        printer.newLine();

        // Product list in big bold font
        printer.setTextDoubleHeight();
        printer.bold(true);
        ticketData.transaction.products.forEach((item) => {
            if (item.quantity < 0) {
                printer.println(`-x${Math.abs(item.quantity)} ${item.label}`);
            } else {
                printer.println(`x${item.quantity} ${item.label}`);
            }
        });
        printer.bold(false);
        printer.setTextNormal();

        printer.cut();

        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print kitchen ticket:', error);
        return { error: "Erreur lors de l'impression du ticket cuisine" };
    }
}

/**
 * Server action to print a balance statement
 */
export async function printBalanceStatement(
    printerAddresses: string[],
    balanceData: {
        customer: { firstName: string; lastName: string; reference?: string };
        balance: number;
        history: Array<{
            amount: number;
            operation: 'credit' | 'debit';
            previousBalance: number;
            newBalance: number;
            createdAt: string;
        }>;
        shop: Shop;
        currency: Currency;
    },
    comBaud?: number
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses, comBaud);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);
        const currency = balanceData.currency;

        // Print header
        printer.alignCenter();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.invert(true);
        printer.println('                   RELEVÉ DE SOLDE                   ');
        printer.invert(false);
        printer.newLine();
        printReceiptHeader(printer, balanceData.shop);

        // Print date
        printer.println(`Date : ${frenchDateStr} ${frenchTimeStr}`);
        printer.newLine();

        // Print customer info
        printer.alignLeft();
        printer.println(`Client : ${balanceData.customer.firstName} ${balanceData.customer.lastName}`);
        if (balanceData.customer.reference) {
            printer.println(`Référence : ${balanceData.customer.reference}`);
        }
        printer.newLine();

        // Print current balance
        printer.drawLine();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.leftRight('SOLDE ACTUEL', toCurrency(balanceData.balance, currency));
        printer.setTextNormal();
        printer.bold(false);
        printer.drawLine();
        printer.newLine();

        // Print transaction history
        printer.alignCenter();
        printer.println('HISTORIQUE DES OPÉRATIONS');
        printer.newLine();
        printer.alignLeft();

        balanceData.history.forEach((entry) => {
            const date = new Date(entry.createdAt);
            const dateStr = date.toLocaleDateString('fr-FR');
            const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const operationLabel = entry.operation === 'credit' ? 'CRÉDIT' : 'DÉBIT';
            const sign = entry.operation === 'credit' ? '+' : '-';

            printer.println(`${dateStr} ${timeStr} - ${operationLabel}`);
            printer.leftRight(`  ${sign}${toCurrency(entry.amount, currency)}`, toCurrency(entry.newBalance, currency));
            printer.newLine();
        });

        printer.drawLine();
        printer.newLine();

        // Print legal mention
        printer.alignCenter();
        printer.println('Document comptable');
        printer.newLine();

        // Cut
        printer.cut();

        // Execute print
        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print balance statement:', error);
        return { error: "Erreur lors de l'impression du relevé de solde" };
    }
}

/**
 * Server action to print a Ticket Z summary (Z report)
 */
export async function printSummary(
    printerAddresses: string[],
    summaryData: SummaryData,
    comBaud?: number
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses, comBaud);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        // Use pre-computed aggregates from summaryData
        const {
            totalAmount,
            transactionCount,
            productCount,
            firstTransactionDate: firstDate,
            lastTransactionDate: lastDate,
            payments,
            provisionBreakdown,
            debitTotal,
            employerShareTotal,
        } = summaryData;
        const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;
        const currency = summaryData.currency;

        // ── Internal header (shop name large + SIRET, centered) ──
        printInternalHeader(printer, summaryData.shop);

        // Format the transaction dates
        const firstTransactionDate = new Date(firstDate);
        const lastTransactionDate = new Date(lastDate);
        const { frenchDateStr: firstDateStr, frenchTimeStr: firstTimeStr } = formatFrenchDate(firstTransactionDate);
        const { frenchDateStr: lastDateStr, frenchTimeStr: lastTimeStr } = formatFrenchDate(lastTransactionDate);

        // Print the header information
        printer.alignLeft();
        printer.leftRight(`Date d'impression :`, `${frenchDateStr} ${frenchTimeStr}`);
        printer.leftRight(`Ouverture :`, `${firstDateStr} ${firstTimeStr}`);
        printer.leftRight(`Clôture :`, `${lastDateStr} ${lastTimeStr}`);
        printer.newLine();

        // Commands and clients
        printer.leftRight(`Produits : ${productCount}`, `Ventes : ${transactionCount}`);
        printer.println(`Ticket moyen : ${toCurrency(averageTicket, currency)}`);
        printer.newLine();

        // Separator line
        printer.drawLine();
        printer.newLine();

        // ── Payment summary (Nbr Règlements / Totaux) ──
        printer.bold(true);
        printer.leftRight('Nbr Règlements', 'Totaux');
        printer.bold(false);
        for (const payment of payments) {
            printer.leftRight(`${payment.quantity}  ${payment.category}`, toCurrency(payment.amount, currency));
        }
        if (employerShareTotal > 0) {
            printer.leftRight(
                `${toCurrency(employerShareTotal, currency)} Hors CA`,
                toCurrency(totalAmount + employerShareTotal, currency)
            );
        }
        printer.newLine();
        printer.leftRight('TOTAL NET EN CAISSE', toCurrency(totalAmount, currency));
        printer.newLine();

        // ── Crédits Clients Accordés (DEBIT payments) + Règl. Clients ──
        if (debitTotal > 0) {
            printer.leftRight('Crédits Clients Accordés', toCurrency(debitTotal, currency));
        }
        printer.leftRight('Règl. Clients (total)', toCurrency(totalAmount, currency));
        printer.newLine();

        // ── Répartition Total Caisse (per-customer provisions) ──
        if (provisionBreakdown.length) {
            printer.bold(true);
            printer.println('Répartition Total Caisse');
            printer.bold(false);
            let provisionSubtotal = 0;
            for (const entry of provisionBreakdown) {
                printer.leftRight(`${entry.method} ${entry.customerName}`, toCurrency(entry.amount, currency));
                provisionSubtotal += entry.amount;
            }
            printer.leftRight('Solde Mouvements Caisse', toCurrency(provisionSubtotal, currency));
            printer.newLine();
        }

        // ── Categories + VAT table (from summary lines) ──
        printer.drawLine();
        printer.newLine();

        for (const line of summaryData.summary) {
            if (line === '') {
                printer.newLine();
                printer.drawLine();
                printer.newLine();
            } else if (line.includes('⟹')) {
                printer.leftRight(line.split('⟹')[0].trim(), toCurrency(line.split('⟹')[1], currency));
            } else if (line.includes('\t')) {
                const cells = line.split('\t');
                printer.table(
                    cells.map((s, idx) => {
                        const trimmed = s.trim();
                        // First column is the rate label (e.g. 'T1 5.5%') — print as-is, never as currency
                        if (idx === 0) return trimmed;
                        return toCurrency(trimmed, currency);
                    })
                );
            } else printer.println(line);
        }
        printer.newLine();

        // Separator line
        printer.drawLine();
        printer.newLine();

        // Total TTC
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.leftRight('TOTAL TTC', toCurrency(totalAmount, currency));
        printer.bold(false);
        printer.setTextNormal();
        printer.cut();

        // Execute print
        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print summary:', error);
        return { error: "Erreur lors de l'impression du ticket Z" };
    }
}

/**
 * Server action to print a Ticket X (flash report) — a snapshot of the day's
 * sales without closing the day.  Includes the same payment/VAT/category
 * breakdown as the Z ticket plus a per-payment-method detail section and a
 * full product list.
 */
export async function printTicketX(
    printerAddresses: string[],
    summaryData: SummaryData,
    comBaud?: number
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses, comBaud);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        const {
            totalAmount,
            transactionCount,
            productCount,
            firstTransactionDate: firstDate,
            lastTransactionDate: lastDate,
            payments,
            provisionBreakdown,
            debitTotal,
            employerShareTotal,
            transactions,
            cancellations,
            refunds,
            currency,
        } = summaryData;
        const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;

        // ── Internal header (shop name large + SIRET, centered) ──
        printInternalHeader(printer, summaryData.shop);

        // Flash title (centered)
        const flashDate = firstDate ? formatFrenchDate(new Date(firstDate)).frenchDateStr : frenchDateStr;
        printer.alignCenter();
        printer.bold(true);
        printer.println('FLASH du ' + flashDate);
        printer.bold(false);
        printer.newLine();

        // Format the transaction dates
        const firstTransactionDate = new Date(firstDate);
        const lastTransactionDate = new Date(lastDate);
        const { frenchDateStr: firstDateStr, frenchTimeStr: firstTimeStr } = formatFrenchDate(firstTransactionDate);
        const { frenchDateStr: lastDateStr, frenchTimeStr: lastTimeStr } = formatFrenchDate(lastTransactionDate);

        // Print the header information
        printer.alignLeft();
        printer.leftRight(`Date d'impression :`, `${frenchDateStr} ${frenchTimeStr}`);
        printer.leftRight(`Ouverture :`, `${firstDateStr} ${firstTimeStr}`);
        printer.leftRight(`Clôture :`, `${lastDateStr} ${lastTimeStr}`);
        printer.newLine();

        // Commands and clients
        printer.leftRight(`Produits : ${productCount}`, `Ventes : ${transactionCount}`);
        printer.println(`Ticket moyen : ${toCurrency(averageTicket, currency)}`);
        printer.newLine();

        // Separator line
        printer.drawLine();
        printer.newLine();

        // ── Payment summary (Nbr Règlements / Totaux) ──
        printer.bold(true);
        printer.leftRight('Nbr Règlements', 'Totaux');
        printer.bold(false);
        for (const payment of payments) {
            printer.leftRight(`${payment.quantity}  ${payment.category}`, toCurrency(payment.amount, currency));
        }
        if (employerShareTotal > 0) {
            printer.leftRight(
                `${toCurrency(employerShareTotal, currency)} Hors CA`,
                toCurrency(totalAmount + employerShareTotal, currency)
            );
        }
        printer.newLine();
        printer.leftRight('TOTAL NET EN CAISSE', toCurrency(totalAmount, currency));
        printer.newLine();

        // ── Crédits Clients Accordés (DEBIT payments) + Règl. Clients ──
        if (debitTotal > 0) {
            printer.leftRight('Crédits Clients Accordés', toCurrency(debitTotal, currency));
        }
        printer.leftRight('Règl. Clients (total)', toCurrency(totalAmount, currency));
        printer.newLine();

        // ── Répartition Total Caisse (per-customer provisions) ──
        if (provisionBreakdown.length) {
            printer.bold(true);
            printer.println('Répartition Total Caisse');
            printer.bold(false);
            let provisionSubtotal = 0;
            for (const entry of provisionBreakdown) {
                printer.leftRight(`${entry.method} ${entry.customerName}`, toCurrency(entry.amount, currency));
                provisionSubtotal += entry.amount;
            }
            printer.leftRight('Solde Mouvements Caisse', toCurrency(provisionSubtotal, currency));
            printer.newLine();
        }

        // ── Categories + VAT table (from summary lines) ──
        printer.drawLine();
        printer.newLine();

        for (const line of summaryData.summary) {
            if (line === '') {
                printer.newLine();
                printer.drawLine();
                printer.newLine();
            } else if (line.includes('⟹')) {
                printer.leftRight(line.split('⟹')[0].trim(), toCurrency(line.split('⟹')[1], currency));
            } else if (line.includes('\t')) {
                const cells = line.split('\t');
                printer.table(
                    cells.map((s, idx) => {
                        const trimmed = s.trim();
                        if (idx === 0) return trimmed;
                        return toCurrency(trimmed, currency);
                    })
                );
            } else printer.println(line);
        }
        printer.newLine();

        // ── Détail des Règlements ──
        printer.drawLine();
        printer.newLine();
        printer.bold(true);
        printer.println('Détail des Règlements');
        printer.bold(false);

        if (transactions && transactions.length) {
            const methodGroups = new Map<string, Transaction[]>();
            for (const tx of transactions) {
                const group = methodGroups.get(tx.method) || [];
                group.push(tx);
                methodGroups.set(tx.method, group);
            }

            for (const [method, txs] of methodGroups) {
                const methodTotal = txs.reduce((sum, tx) => sum + tx.amount, 0);
                printer.println(`${method} (${txs.length})`);
                const provisions = txs.filter((tx) => tx.products.length === 0 && tx.customerName);
                for (const prov of provisions) {
                    printer.leftRight(`  ${prov.customerName}`, toCurrency(prov.amount, currency));
                }
                printer.leftRight(`--- TOTAL ${method}`, toCurrency(methodTotal, currency));
                printer.newLine();
            }
        }
        printer.leftRight('TOTAL Règlements', toCurrency(totalAmount, currency));
        printer.newLine();

        // ── Liste des Produits Vendus ──
        printer.drawLine();
        printer.newLine();
        printer.bold(true);
        printer.println('Liste des Produits Vendus');
        printer.bold(false);
        printer.newLine();

        if (transactions && transactions.length) {
            const productMap = new Map<string, { quantity: number; amount: number }>();
            for (const tx of transactions) {
                for (const product of tx.products) {
                    const key = product.label || '';
                    const existing = productMap.get(key);
                    if (existing) {
                        existing.quantity += product.quantity;
                        existing.amount += product.total ?? 0;
                    } else {
                        productMap.set(key, {
                            quantity: product.quantity,
                            amount: product.total ?? 0,
                        });
                    }
                }
            }

            const sortedProducts = Array.from(productMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

            let totalQty = 0;
            let totalProductsAmount = 0;
            for (const [label, { quantity, amount }] of sortedProducts) {
                const maxLabelLen = 24;
                const truncatedLabel = label.length > maxLabelLen ? label.substring(0, maxLabelLen) : label;
                printer.leftRight(`${truncatedLabel} x${quantity}`, toCurrency(amount, currency));
                totalQty += quantity;
                totalProductsAmount += amount;
            }

            printer.drawLine();
            printer.bold(true);
            printer.leftRight(`TOTAL x${totalQty}`, toCurrency(totalProductsAmount, currency));
            printer.bold(false);
        }

        // ── LISTE ANNULATIONS (deleted / cancelled transactions) ──
        if (cancellations && cancellations.length) {
            printer.newLine();
            printer.drawLine();
            printer.newLine();
            printer.bold(true);
            printer.println('LISTE ANNULATIONS');
            printer.bold(false);

            let cancelQty = 0;
            let cancelAmount = 0;
            for (const tx of cancellations) {
                const qty = tx.products.reduce((sum, p) => sum + p.quantity, 0) || 1;
                const maxLabelLen = 24;
                const label = tx.products.length
                    ? tx.products.map((p) => p.label).join(' + ')
                    : tx.customerName || tx.method;
                const truncatedLabel = label.length > maxLabelLen ? label.substring(0, maxLabelLen) : label;
                printer.leftRight(`-${truncatedLabel} x${qty}`, toCurrency(tx.amount, currency));
                cancelQty += qty;
                cancelAmount += tx.amount;
            }
            printer.bold(true);
            printer.leftRight(`Total Annulation x${cancelQty}`, toCurrency(cancelAmount, currency));
            printer.bold(false);
        }

        // ── Liste des Avoirs (refunds) ──
        if (refunds && refunds.length) {
            printer.newLine();
            printer.drawLine();
            printer.newLine();
            printer.bold(true);
            printer.println('Liste des Avoirs');
            printer.bold(false);

            let refundQty = 0;
            let refundAmount = 0;
            for (const tx of refunds) {
                const qty = tx.products.reduce((sum, p) => sum + p.quantity, 0) || 1;
                const maxLabelLen = 24;
                const label = tx.products.length
                    ? tx.products.map((p) => p.label).join(' + ')
                    : tx.customerName || tx.method;
                const truncatedLabel = label.length > maxLabelLen ? label.substring(0, maxLabelLen) : label;
                const employerLabel = tx.employerShare ? ' --HORS CA' : '';
                printer.leftRight(`${truncatedLabel} x${qty}${employerLabel}`, toCurrency(tx.amount, currency));
                refundQty += qty;
                refundAmount += tx.amount;
            }
            printer.bold(true);
            printer.leftRight(`Total Avoirs x${refundQty}`, toCurrency(refundAmount, currency));
            printer.bold(false);
        }

        // Separator line
        printer.newLine();
        printer.drawLine();
        printer.newLine();

        // Total TTC
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.leftRight('TOTAL TTC', toCurrency(totalAmount, currency));
        printer.bold(false);
        printer.setTextNormal();
        printer.cut();

        // Execute print
        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print Ticket X:', error);
        return { error: "Erreur lors de l'impression du ticket X" };
    }
}

function toFrenchAmount(amount: number): string {
    const [int, dec] = amount.toFixed(2).split('.');
    const intWithSpaces = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${intWithSpaces},${dec}`;
}

function formatAccountNumber(reference: string): string {
    const trimmed = reference.trim();
    if (!trimmed) return '';
    const num = Number(trimmed);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
        return String(num).padStart(6, '0');
    }
    return trimmed;
}

function printBillingHeader(printer: ThermalPrinter, title: string, report: BillingReport, shop: Shop): void {
    const currentDate = new Date();
    const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);
    // Dates arrive as 'YYYY-MM-DD'; parse as local time to avoid a UTC off-by-one day shift.
    const startLabel = new Date(`${report.startDate}T00:00:00`).toLocaleDateString('fr-FR');
    const endLabel = new Date(`${report.endDate}T00:00:00`).toLocaleDateString('fr-FR');
    const timeLabel = `${frenchTimeStr.split(':')[0]}h${frenchTimeStr.split(':')[1]}`;

    // Simplified header: shop name (large) + SIRET, centered
    printInternalHeader(printer, shop);

    printer.drawLine();
    printer.alignCenter();
    printer.println(title);
    printer.newLine();

    printer.alignLeft();
    printer.println(`${report.companyName} - Compte n°${report.companyId}`);
    printer.println(`du ${startLabel} au ${endLabel} à ${timeLabel}`);
    printer.println(`Imprimé le ${frenchDateStr} à ${timeLabel}`);
    printer.newLine();
}

/**
 * Server action to print the billing summary report including VAT.
 */
export async function printBillingSummary(
    printerAddresses: string[],
    report: BillingReport,
    shop: Shop,
    _currency: Currency
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses);
        if (!printer || error) return { error };

        printBillingHeader(printer, 'Ventes Facturées : Statistiques de Caisses', report, shop);

        const startLabel = new Date(`${report.startDate}T00:00:00`).toLocaleDateString('fr-FR');
        const endLabel = new Date(`${report.endDate}T00:00:00`).toLocaleDateString('fr-FR');
        const dateRange = `du ${startLabel} au ${endLabel.slice(5)}`;

        // Table header
        printer.tableCustom([
            { text: '', align: 'LEFT', cols: 24 },
            { text: 'Qté', align: 'RIGHT', cols: 12 },
            { text: 'CA', align: 'RIGHT', cols: 12 },
        ]);

        // Date range row
        printer.tableCustom([
            { text: dateRange, align: 'LEFT', cols: 24 },
            { text: String(report.mealCount), align: 'RIGHT', cols: 12 },
            { text: '', align: 'RIGHT', cols: 12 },
        ]);

        // TOTAUX row
        printer.bold(true);
        printer.tableCustom([
            { text: `CA TOTAL (${report.ticketCount} Tickets)`, align: 'LEFT', cols: 24 },
            { text: String(report.mealCount), align: 'RIGHT', cols: 12 },
            { text: toFrenchAmount(report.customerPaidAmount), align: 'RIGHT', cols: 12 },
        ]);
        printer.bold(false);

        // Hors CA line (employer share = totalAmount, grand total = customer + employer)
        printer.leftRight(
            `--${toFrenchAmount(report.totalAmount)} Hors CA =`,
            toFrenchAmount(report.customerPaidAmount + report.totalAmount)
        );

        // Per-VAT breakdown
        for (const vat of report.vatBreakdown) {
            printer.leftRight(`CA en TVA ${vat.label}`, `${vat.quantity}  ${toFrenchAmount(vat.ca)}`);
        }
        printer.println('TOTAUX');
        for (const vat of report.vatBreakdown) {
            printer.leftRight(`Total TVA ${vat.label}`, toFrenchAmount(vat.tva));
        }
        for (const vat of report.vatBreakdown) {
            printer.leftRight(`TOTAL HT ${vat.label}`, toFrenchAmount(vat.ht));
        }
        const grandHT = report.vatBreakdown.reduce((sum, v) => sum + v.ht, 0);
        printer.leftRight('TOTAL HT', toFrenchAmount(grandHT));
        printer.newLine();

        // Ventilations
        printer.drawLine();
        printer.bold(true);
        printer.println('----VENTILATIONS----');
        printer.bold(false);
        for (const vent of report.ventilations) {
            printer.leftRight(vent.category, `${vent.quantity}  ${toFrenchAmount(vent.amount)}`);
        }
        printer.newLine();

        // Payment totals
        printer.drawLine();
        printer.bold(true);
        printer.println('TOTAUX REGLEMENTS');
        printer.bold(false);
        for (const pay of report.paymentTotals) {
            printer.leftRight(pay.method, `${pay.count}  ${toFrenchAmount(pay.amount)}`);
        }
        const totalRegl = report.paymentTotals.reduce((sum, p) => sum + p.amount, 0);
        printer.leftRight('Total règlements', toFrenchAmount(totalRegl));
        printer.newLine();

        // Refunds (Avoirs)
        if (report.refundCount > 0) {
            printer.drawLine();
            printer.println(`Liste des Avoirs <= ${report.refundCount}`);
            printer.leftRight('HORS CA', `${report.mealCount}  ${toFrenchAmount(report.totalAmount)}`);
        }
        printer.newLine();

        printer.drawLine();
        printer.println('Document comptable');
        printer.newLine();
        printer.cut();

        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print billing summary:', error);
        return { error: "Erreur lors de l'impression du total TVA" };
    }
}

/**
 * Server action to print the detailed per-customer billing report.
 */
export async function printBillingDetail(
    printerAddresses: string[],
    report: BillingReport,
    shop: Shop,
    _currency: Currency
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses);
        if (!printer || error) return { error };

        printBillingHeader(printer, 'Ventes Facturées par Client', report, shop);

        if (report.customers && report.customers.length > 0) {
            printer.tableCustom([
                { text: 'N° Cpt', align: 'LEFT', cols: 8 },
                { text: 'Désignation', align: 'LEFT', cols: 20 },
                { text: 'Qté', align: 'RIGHT', cols: 6 },
                { text: 'CA', align: 'RIGHT', cols: 14 },
            ]);
            printer.drawLine();

            for (const customer of report.customers) {
                const account = formatAccountNumber(customer.reference ?? '');
                const fullName = `${customer.lastName} ${customer.firstName}`.trim();
                const name = fullName.length > 20 ? fullName.slice(0, 17) + '...' : fullName;
                const qty = String(customer.mealCount);
                const ca = toFrenchAmount(customer.totalAmount);

                // Avoid overflow by trimming cells to column width
                printer.tableCustom([
                    { text: account.slice(-8), align: 'LEFT', cols: 8 },
                    { text: name, align: 'LEFT', cols: 20 },
                    { text: qty, align: 'RIGHT', cols: 6 },
                    { text: ca.length <= 14 ? ca : ca.slice(0, 14), align: 'RIGHT', cols: 14 },
                ]);
            }

            printer.newLine();
            printer.drawLine();
            printer.setTextDoubleHeight();
            printer.bold(true);
            printer.tableCustom([
                { text: 'TOTAUX', align: 'LEFT', cols: 28 },
                { text: String(report.mealCount), align: 'RIGHT', cols: 6 },
                { text: toFrenchAmount(report.totalAmount), align: 'RIGHT', cols: 14 },
            ]);
            printer.bold(false);
            printer.setTextNormal();
        } else {
            printer.println('Aucun repas pour cette période');
        }

        printer.newLine();
        printer.drawLine();
        printer.println('Document comptable');
        printer.newLine();
        printer.cut();

        await executePrint(printer);
        return { success: true };
    } catch (error) {
        console.error('Failed to print billing detail:', error);
        return { error: "Erreur lors de l'impression du détail par salarié" };
    }
}

/**
 * Opens a cash drawer connected to the cashier printer's DK port (RJ11).
 * Sends the full ESC/POS cash drawer kick command: ESC p m t1 t2.
 *
 * node-thermal-printer's openCashDrawer() sends only 3 bytes (ESC p m) without
 * the required t1/t2 timing bytes, so many printers ignore the incomplete
 * command. We bypass it and send the proper 5-byte command directly.
 *
 * Works for both COM port and TCP/IP connected printers.
 */
export async function openCashDrawer(printerAddress: string, baudRate?: number): Promise<PrintResponse> {
    if (IS_DEV) {
        console.log(`[MOCK] Opening cash drawer on ${printerAddress}`);
        return { success: true };
    }

    try {
        const resolvedAddress = resolvePrinterAddress(printerAddress);
        const result = await initPrinter([resolvedAddress]);
        if ('error' in result) {
            console.error(`[CASH DRAWER] initPrinter error: ${result.error}`);
            return { error: result.error };
        }

        const printer = result.printer;
        if (baudRate) {
            (printer as unknown as { _comBaud?: number })._comBaud = baudRate;
        }
        // Send the full ESC/POS cash drawer kick command for both pins:
        //   ESC p m t1 t2
        //   m=0 → pin 2, m=1 → pin 5
        //   t1 = pulse ON time  (in 2ms units; 0x19 = 25 → 50ms)
        //   t2 = pulse OFF time (in 2ms units; 0xFA = 250 → 500ms)
        const drawerCmd = Buffer.concat([
            Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]), // pin 2
            Buffer.from([0x1b, 0x70, 0x01, 0x19, 0xfa]), // pin 5
        ]);
        // Replace the printer buffer (which contains the constructor's code page command)
        // with only the raw drawer command — no code page setup needed for the cash drawer.
        printer.setBuffer(drawerCmd);
        await executePrint(printer);

        console.log(`[CASH DRAWER] Opened on ${printerAddress}`);
        return { success: true };
    } catch (error) {
        console.error(`[CASH DRAWER] Failed to open on ${printerAddress}:`, error);
        return { error: `Erreur ouverture tiroir caisse: ${(error as Error).message}` };
    }
}

/**
 * Server action to test printer connectivity.
 * Sends a small test message and cut command.
 *
 * For COM ports, the test is repeated at each common baud rate, labelling every
 * ticket with the rate used. Exactly one will print legibly — set
 * TRADIZ_PRINTER_BAUDRATE to that value (in %APPDATA%\tradiz\.env.local).
 */
export async function testPrint(address: string): Promise<PrintResponse> {
    if (IS_DEV) {
        console.log(`[MOCK] Test print to ${address}`);
        return { success: true };
    }

    console.log(`[PRINTER] testPrint called with address: ${address}`);

    const resolved = resolvePrinterAddress(address);
    if (isComPort(resolved)) return testPrintAllBaudRates(resolved);

    try {
        const resolvedAddress = resolved;
        const result = await initPrinter([resolvedAddress]);
        if ('error' in result) {
            console.error(`[PRINTER] initPrinter error: ${result.error}`);
            return { error: result.error };
        }
        const printer = result.printer;
        console.log(`[PRINTER] Printer initialized, building test content...`);

        printer.alignCenter();
        printer.bold(true);
        printer.setTextDoubleHeight();
        printer.println('TEST TRADIZ');
        printer.bold(false);
        printer.setTextNormal();
        printer.println(`Port: ${resolvePrinterAddress(address)}`);
        printer.println(new Date().toLocaleString('fr-FR'));
        printer.newLine();
        printer.cut();

        await executePrint(printer);
        console.log(`[PRINTER] Test print succeeded on ${address}`);
        return { success: true };
    } catch (error) {
        console.error(`[PRINTER] Test print failed on ${address}:`, error);
        return { error: `Erreur test impression ${address}: ${(error as Error).message}` };
    }
}

// Common serial baud rates for thermal receipt printers, slowest first.
const COMMON_BAUD_RATES = ['9600', '19200', '38400', '57600', '115200'];

/**
 * Prints one short test ticket per baud rate on a COM port, each labelled with the
 * rate used, plus a cash drawer kick. Whichever ticket is legible (and whether the
 * drawer opened) identifies the correct serial settings.
 */
async function testPrintAllBaudRates(comPort: string): Promise<PrintResponse> {
    const originalBaud = process.env.TRADIZ_PRINTER_BAUDRATE;
    const succeeded: string[] = [];
    try {
        for (const baud of COMMON_BAUD_RATES) {
            // configureComPort reads the baud rate from the environment on each write.
            process.env.TRADIZ_PRINTER_BAUDRATE = baud;
            try {
                const result = await initPrinter([comPort]);
                if ('error' in result) {
                    console.error(`[PRINTER] initPrinter error at ${baud} baud: ${result.error}`);
                    continue;
                }
                const printer = result.printer;
                printer.alignCenter();
                printer.bold(true);
                printer.setTextDoubleHeight();
                printer.println(`BAUD ${baud}`);
                printer.bold(false);
                printer.setTextNormal();
                printer.println('Test Tradiz - accents: e a u c');
                printer.println('Accents: é à ù ç €');
                printer.println(`${comPort} - ${new Date().toLocaleTimeString('fr-FR')}`);
                // Kick the drawer so we can also tell which rate drives it.
                printer.append(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
                printer.newLine();
                printer.cut();

                await executePrint(printer);
                console.log(`[PRINTER] Test print sent at ${baud} baud on ${comPort}`);
                succeeded.push(baud);
            } catch (error) {
                console.error(`[PRINTER] Test print failed at ${baud} baud:`, error);
            }
        }
    } finally {
        if (originalBaud === undefined) delete process.env.TRADIZ_PRINTER_BAUDRATE;
        else process.env.TRADIZ_PRINTER_BAUDRATE = originalBaud;
    }

    if (!succeeded.length) return { error: `Aucun test n'a pu être envoyé sur ${comPort}` };
    return { success: true };
}
