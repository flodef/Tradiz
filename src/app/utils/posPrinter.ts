'use server';

import { CharacterSet, PrinterTypes, ThermalPrinter } from 'node-thermal-printer';
import { networkInterfaces } from 'os';
import { Shop } from '../contexts/ConfigProvider';
import { ReceiptData } from '../hooks/usePay';
import { SummaryData } from '../hooks/useSummary';
import { IS_DEV, PROCESSING_KEYWORD, WAITING_KEYWORD } from './constants';
import { formatFrenchDate, generateReceiptNumber } from './date';
import { createMockPrinter } from './mockPrinter';

type PrintResponse = {
    success?: boolean;
    error?: string;
};

/**
 * Checks if the printer is on the same subnet as the device
 */
const initPrinter = async (printerIPAddresses: string[]) => {
    // If in DEV mode, return a mock printer that prints to the console
    if (IS_DEV) return { printer: await createMockPrinter() };

    // Normal printer initialization for production
    const myIp = getLocalIp();
    if (!myIp) return { error: "Vous n'êtes pas sur un réseau local" };
    const connectedPrinterIPAddress = printerIPAddresses.find((address) => isSameSubnet(myIp, address));
    if (!connectedPrinterIPAddress) return { error: 'Aucune imprimante connectée sur le même réseau que ' + myIp };

    const printer = await getPrinter(connectedPrinterIPAddress);
    if (!printer) return { error: 'Imprimante non connectée sur ' + connectedPrinterIPAddress };
    return { printer };
};

/**
 * Creates a printer instance and checks connection
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
    if (shop.id) printer.println((shop.idType ? shop.idType + ': ' : '') + shop.id);
    if (shop.email) printer.println(shop.email);
    printer.newLine();
}

/**
 * Formats an amount to a string with the specified currency
 */
const toCurrency = (amount: number | string, currency: string) =>
    Number(
        amount
            .toString()
            .replace(/[^0-9., ]/g, '')
            .trim()
    ).toFixed(2) + currency;

/**
 * Server action to print a receipt with standard formatting
 */
export async function printReceipt(printerAddresses: string[], receiptData: ReceiptData): Promise<PrintResponse> {
    try {
        const { printer, error } = await initPrinter(printerAddresses);
        if (!printer || error) return { error };

        const currentDate = new Date();
        const receiptNumber = generateReceiptNumber('R', currentDate);
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        const paymentMethod =
            receiptData.transaction.method !== WAITING_KEYWORD && receiptData.transaction.method !== PROCESSING_KEYWORD
                ? receiptData.transaction.method
                : undefined;
        const currency = receiptData.transaction.currency.match(/\((.+)\)/)?.[1] || receiptData.transaction.currency;

        // Print header
        printShopInfo(printer, receiptData.shop);
        printer.println(`Date : ${frenchDateStr} ${frenchTimeStr}`);
        printer.println(`N° de reçu : ${receiptNumber}`);
        if (receiptData.orderNumber) printer.println(`N° de commande : ${receiptData.orderNumber}`);
        if (receiptData.serviceType) {
            const serviceLabel = receiptData.serviceType === 'sur_place' ? 'Sur place' : 'À emporter';
            printer.println(`Service : ${serviceLabel}`);
        }
        if (receiptData.transaction.validator) printer.println(`Vendeur•se : ${receiptData.transaction.validator}`);
        printer.newLine();

        // Print items header
        printer.drawLine();
        printer.alignLeft();
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
                { text: toCurrency(item.amount || 0, currency), align: 'LEFT', cols: 7 },
                { text: '', align: 'LEFT', cols: 1 },
                { text: toCurrency(item.total || 0, currency), align: 'LEFT', cols: 8 },
            ]);
        });

        // Calculate totals by VAT rate
        const vatTotals = new Map<number, { ht: number; tva: number; ttc: number }>();
        let totalHT = 0;
        let totalTTC = 0;

        receiptData.transaction.products.forEach((item) => {
            const itemCategory = receiptData.inventory?.find((inv) => inv.category === item.category);
            const rawRate = itemCategory?.rate ?? 20; // Default to 20% if not found

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
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.leftRight('TOTAL TTC', toCurrency(totalTTC, currency));
        printer.bold(false);
        printer.setTextNormal();
        printer.drawLine();

        // Print payment method if available
        printer.alignCenter();
        printer.println(paymentMethod ? `Mode de paiement: ${paymentMethod}` : 'À RÉGLER');
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
        await printer.execute();
        return { success: true };
    } catch (error) {
        console.error('Failed to print receipt:', error);
        return { error: "Erreur lors de l'impression du reçu" };
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
        const transactionCount = summaryData.transactions.length;
        const productCount = summaryData.transactions.reduce(
            (total, transaction) =>
                total + transaction.products.reduce((total, product) => total + product.quantity, 0),
            0
        );
        const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;
        const currency = transactionCount > 0 ? summaryData.transactions[0].currency : '€';

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
            } else if (line.includes('==>')) {
                printer.leftRight(line.split('==>')[0].trim(), toCurrency(line.split('==>')[1], currency));
            } else if (line.includes('\n'))
                printer.table(
                    line
                        .split('\n')
                        .map((s) => (s.includes('.') || s.includes(',') ? toCurrency(s, currency) : s.trim()))
                );
            else printer.println(line);
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
        await printer.execute();
        return { success: true };
    } catch (error) {
        console.error('Failed to print summary:', error);
        return { error: "Erreur lors de l'impression du ticket Z" };
    }
}
