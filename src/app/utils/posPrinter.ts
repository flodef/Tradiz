'use server';

import { CharacterSet, PrinterTypes, ThermalPrinter } from 'node-thermal-printer';
import { networkInterfaces } from 'os';
import { execSync } from 'child_process';
import fs from 'fs';
import { Shop } from '../contexts/ConfigProvider';
import {
    isDeletedTransaction,
    isProcessingTransaction,
    isRefundTransaction,
    isWaitingTransaction,
} from '../contexts/dataProvider/transactionHelpers';
import { ReceiptData } from '../hooks/usePay';
import { SummaryData } from '../hooks/useSummary';
import { DEFAULT_VAT_RATE, IS_DEV } from './constants';
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
                fd = fs.openSync(path, 'r+');
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

function printShopInfo(printer: ThermalPrinter, shop: Shop) {
    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(shop.name.toUpperCase());
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();
    if (shop.address) printer.println(shop.address);
    if (shop.zipCode && shop.city) printer.println(shop.zipCode + ' ' + shop.city);
    if (shop.serial) printer.println('SIRET : ' + shop.serial);
    if (shop.email) printer.println(shop.email);
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
        printShopInfo(printer, receiptData.shop);
        printer.println(`Date : ${frenchDateStr} ${frenchTimeStr}`);
        printer.println(`N° de reçu : ${receiptNumber}`);
        if (receiptData.orderNumber) printer.println(`N° de commande : ${receiptData.orderNumber}`);
        if (receiptData.serviceType) {
            const serviceLabel = SERVICE_TYPE_LABELS[receiptData.serviceType];
            printer.println(`Service : ${serviceLabel}`);
        }
        if (receiptData.transaction.validator) printer.println(`Vendeur•se : ${receiptData.transaction.validator}`);
        printer.newLine();

        // Print items header
        printer.drawLine();
        printer.alignLeft();

        const showDetails = receiptData.showDetails !== false; // default true

        printer.tableCustom([
            { text: 'QTE', align: 'LEFT', cols: 4 },
            { text: '', align: 'LEFT', cols: 1 },
            { text: 'DESIGNATION', align: 'LEFT', cols: 26 },
            { text: '', align: 'LEFT', cols: 1 },
            { text: 'P.U.', align: 'LEFT', cols: 7 },
            { text: '', align: 'LEFT', cols: 1 },
            { text: 'TOTAL', align: 'LEFT', cols: 8 },
        ]);
        printer.drawLine();

        // Print each item
        receiptData.transaction.products.forEach((item) => {
            let label = item.label;
            if (item.discount.amount > 0) {
                label += ` (-${item.discount.amount}${item.discount.unit})`;
            }
            const labelLength = label.length;
            label = labelLength > 26 ? label.slice(0, 23) + '...' : label;

            printer.tableCustom([
                { text: `x${item.quantity}`, align: 'LEFT', cols: 4 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: label, align: 'LEFT', cols: 26 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(item.amount, currency), align: 'LEFT', cols: 7 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(item.total || 0, currency), align: 'LEFT', cols: 8 },
            ]);

            // In detail mode, expand formula/article options as indented sub-lines
            if (showDetails && item.options) {
                try {
                    const parsedOptions: Array<{ type: string; value: string; price: number }> = JSON.parse(
                        item.options
                    );
                    for (const opt of parsedOptions) {
                        const optLabel = `  ${opt.value}`;
                        const truncated = optLabel.length > 26 ? optLabel.slice(0, 23) + '...' : optLabel;
                        printer.tableCustom([
                            { text: '', align: 'LEFT', cols: 4 },
                            { text: '', align: 'LEFT', cols: 1 },
                            { text: truncated, align: 'LEFT', cols: 26 },
                            { text: '', align: 'LEFT', cols: 1 },
                            { text: '', align: 'LEFT', cols: 7 },
                            { text: '', align: 'LEFT', cols: 1 },
                            { text: '', align: 'LEFT', cols: 8 },
                        ]);
                    }
                } catch {
                    // Not valid JSON options, skip
                }
            }
        });

        // Calculate totals by VAT rate
        const vatTotals = new Map<number, { ht: number; tva: number; ttc: number }>();
        let totalHT = 0;
        let totalTTC = 0;

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

        // Print employer share line if applicable
        const employerShare = receiptData.transaction.employerShare;
        if (employerShare && employerShare > 0) {
            printer.alignLeft();
            printer.leftRight('Quote part employeur', '-' + toCurrency(employerShare, currency));
            printer.drawLine();
        }

        // Print fidelity points used line if applicable
        const fidelityPointsUsed = receiptData.transaction.fidelityPointsUsed;
        if (fidelityPointsUsed && fidelityPointsUsed > 0) {
            printer.alignLeft();
            printer.leftRight('Fidélité', '-' + toCurrency(fidelityPointsUsed, currency));
            printer.drawLine();
        }

        // Print total
        printer.newLine();
        printer.drawLine();

        // Print totals HT by VAT rate
        printer.alignLeft();
        vatTotals.forEach((values, rate) => {
            const ratePercent = (rate * 100).toFixed(0);
            printer.leftRight(`Total HT ${ratePercent}%`, toCurrency(values.ht, currency));
        });

        // Print VAT by rate (without extra newlines)
        vatTotals.forEach((values, rate) => {
            const ratePercent = (rate * 100).toFixed(0);
            printer.leftRight(`TVA ${ratePercent}%`, toCurrency(values.tva, currency));
        });

        // Print total HT
        printer.leftRight('TOTAL HT', toCurrency(totalHT, currency));

        printer.drawLine();

        // Print total TTC (larger and bold, isolated)
        // If there's an employer share, show the products total then the customer-paid total
        printer.setTextDoubleHeight();
        printer.bold(true);
        if (employerShare && employerShare > 0) {
            printer.leftRight('Total produits', toCurrency(totalTTC, currency));
            printer.leftRight('NET À PAYER', toCurrency(Math.max(0, totalTTC - employerShare), currency));
        } else {
            printer.leftRight('TOTAL TTC', toCurrency(totalTTC, currency));
        }
        printer.bold(false);
        printer.setTextNormal();
        printer.drawLine();

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

        printer.newLine();

        // Print legal mention
        printer.alignCenter();
        printer.println('Logiciel de caisse conforme');
        printer.println("à l'article 286 I-3 bis du CGI");
        printer.newLine();

        // Print thank you message
        printer.alignCenter();
        printer.println(
            paymentMethod
                ? receiptData.thanksMessage || 'Merci pour votre achat !'
                : 'Merci de passer par la caisse avant de partir !'
        );
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
        const isDeleted = isDeletedTransaction(ticketData.transaction);
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
        } else if (isDeleted) {
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
    }
): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses);
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
        printShopInfo(printer, balanceData.shop);

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
export async function printSummary(printerAddresses: string[], summaryData: SummaryData): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        // Calculate average ticket amount
        const totalAmount = summaryData.transactions.reduce((total, transaction) => total + transaction.amount, 0);
        const transactionCount = summaryData.transactions.reduce(
            (count, tx) => count + (isRefundTransaction(tx) ? -1 : 1),
            0
        );
        const productCount = Math.round(
            summaryData.transactions.reduce(
                (total, transaction) =>
                    total + transaction.products.reduce((total, product) => total + product.quantity, 0),
                0
            )
        );
        const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;
        const currency = summaryData.currency;

        // Create a simpler header for the ticket
        printer.alignCenter();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.invert(true);
        printer.println('                    Ticket Z                    ');
        printer.invert(false);
        printer.newLine();
        printShopInfo(printer, summaryData.shop);

        // Find first and last transaction dates
        let firstTransactionDate = currentDate;
        let lastTransactionDate = currentDate;

        if (summaryData.transactions.length > 0) {
            // Sort transactions by creation date
            const sortedTransactions = [...summaryData.transactions].sort((a, b) => a.createdDate - b.createdDate);

            // Get first and last transaction dates
            firstTransactionDate = new Date(sortedTransactions[0].createdDate);
            lastTransactionDate = new Date(sortedTransactions[sortedTransactions.length - 1].createdDate);
        }

        // Format the transaction dates
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

const BANNER_WIDTH = 48;

function centerText(text: string, width: number): string {
    const pad = Math.max(0, width - text.length);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + text + ' '.repeat(right);
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

function printShopBanner(printer: ThermalPrinter, shop: Shop): void {
    const name = shop.name.toUpperCase();
    printer.println('*'.repeat(BANNER_WIDTH));
    printer.println('*' + centerText(name, BANNER_WIDTH - 2) + '*');
    printer.println('*'.repeat(BANNER_WIDTH));
    printer.newLine();
}

function printBillingHeader(printer: ThermalPrinter, title: string, report: BillingReport, shop: Shop): void {
    const currentDate = new Date();
    const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);
    // Dates arrive as 'YYYY-MM-DD'; parse as local time to avoid a UTC off-by-one day shift.
    const startLabel = new Date(`${report.startDate}T00:00:00`).toLocaleDateString('fr-FR');
    const endLabel = new Date(`${report.endDate}T00:00:00`).toLocaleDateString('fr-FR');
    const timeLabel = `${frenchTimeStr.split(':')[0]}h${frenchTimeStr.split(':')[1]}`;

    printShopBanner(printer, shop);

    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(title);
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    printer.alignLeft();
    printer.println(`Compta n° ${report.companyId} du ${startLabel} au ${endLabel} ${timeLabel}`);
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

        printBillingHeader(printer, `Ventes Facturées : Statistiques de Caisses - ${report.companyName}`, report, shop);

        const vatPercent = Number(report.vatRate * 100).toFixed(0);

        printer.drawLine();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.leftRight('TOTAL REPAS', `${report.mealCount}`);
        printer.setTextNormal();
        printer.bold(false);
        printer.drawLine();

        printer.tableCustom([
            { text: 'Qté', align: 'RIGHT', cols: 6 },
            { text: 'CA', align: 'RIGHT', cols: 42 },
        ]);
        printer.drawLine();

        printer.tableCustom([
            { text: String(report.mealCount), align: 'RIGHT', cols: 6 },
            { text: toFrenchAmount(report.totalAmount), align: 'RIGHT', cols: 42 },
        ]);
        printer.newLine();
        printer.drawLine();

        printer.leftRight(`CA en TVA ${vatPercent}%`, toFrenchAmount(report.totalAmount));
        printer.leftRight(`Total TVA ${vatPercent}%`, toFrenchAmount(report.totalTVA));
        printer.leftRight('TOTAL HT', toFrenchAmount(report.totalHT));
        printer.newLine();

        printer.drawLine();
        printer.bold(true);
        printer.println('----VENTILATIONS----');
        printer.bold(false);
        printer.tableCustom([
            { text: report.companyId.toString(), align: 'LEFT', cols: 6 },
            { text: report.companyName, align: 'LEFT', cols: 25 },
            { text: String(report.mealCount), align: 'RIGHT', cols: 6 },
            { text: toFrenchAmount(report.totalAmount), align: 'RIGHT', cols: 11 },
        ]);
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

        printBillingHeader(
            printer,
            `Ventes Facturées par Client - Famille PART EMPLOYEUR - ${report.companyName} - Compte n° ${report.companyId}`,
            report,
            shop
        );

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
