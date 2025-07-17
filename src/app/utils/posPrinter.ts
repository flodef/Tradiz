'use server';

import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { networkInterfaces } from 'os';
import { Shop } from '../contexts/ConfigProvider';
import { Transaction } from '../hooks/useData';
import { formatFrenchDate, generateReceiptNumber } from './date';
import { PROCESSING_KEYWORD, WAITING_KEYWORD, IS_DEV } from './constants';
import { createMockPrinter } from './mockPrinter';

type ReceiptData = {
    shop: Shop;
    transaction: Transaction;
    thanksMessage?: string;
    userName: string;
};

type SummaryData = {
    shop: Shop;
    period: string;
    transactions: Transaction[];
    summary: string[];
};

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
    console.log(myIp, printerIPAddresses);
    const connectedPrinterIPAddress = myIp
        ? printerIPAddresses.find((address) => isSameSubnet(myIp, address))
        : printerIPAddresses.findLast(Boolean);
    if (!connectedPrinterIPAddress) return { error: `Aucune imprimante connectée au même sous-réseau que ${myIp}` };

    console.log(connectedPrinterIPAddress);
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
        interface: 'tcp://' + printerIPAddress,
        width: 48, // 48 characters per line
        characterSet: CharacterSet.PC437_USA,
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
    if (shop.id) printer.println(shop.id);
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
    ).toFixed(2) + (currency.includes('€') ? '$' : currency);

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
        const currency = receiptData.transaction.currency;

        // Print header
        printShopInfo(printer, receiptData.shop);
        printer.println(`Date : ${frenchDateStr} ${frenchTimeStr}`);
        printer.println(`N° de reçu : ${receiptNumber}`);
        if (receiptData.transaction.validator) printer.println(`Vendeur•se : ${receiptData.transaction.validator}`);
        printer.newLine();

        // Print items header
        printer.drawLine();
        printer.alignLeft();
        printer.tableCustom([
            { text: 'ARTICLE', align: 'LEFT', cols: 32 },
            { text: 'PRIX', align: 'CENTER', cols: 8 },
            { text: 'TOTAL', align: 'RIGHT', cols: 8 },
        ]);
        printer.drawLine();

        // Print each item
        receiptData.transaction.products.forEach((item) => {
            let label =
                item.label +
                (item.quantity !== 1 ? ` x${item.quantity}` : '') +
                (item.discount.value > 0 ? ` (-${item.discount.value}${item.discount.unit})` : '');
            const labelLength = label.length;
            label = labelLength > 32 ? item.label.slice(0, 32 - labelLength) + label.slice(item.label.length) : label;
            printer.tableCustom([
                { text: label, align: 'LEFT', cols: 32 },
                { text: toCurrency(item.amount || 0, currency), align: 'CENTER', cols: 8 },
                { text: toCurrency(item.total || 0, currency), align: 'RIGHT', cols: 8 },
            ]);
        });

        // Print total
        printer.newLine();
        printer.drawLine();
        printer.bold(true);
        printer.leftRight('TOTAL', toCurrency(receiptData.transaction.amount, currency));
        printer.bold(false);
        printer.drawLine();

        // Print payment method if available
        printer.alignCenter();
        printer.println(paymentMethod ? `Mode de paiement: ${paymentMethod}` : 'PAS ENCORE PAYÉ');
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
        const transactionCount = summaryData.transactions.length;
        const totalAmount = summaryData.transactions.reduce((total, transaction) => total + transaction.amount, 0);
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
        printer.leftRight(`Commandes : ${transactionCount}`, `Clients : ${transactionCount}`);
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
