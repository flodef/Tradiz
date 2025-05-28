'use server';

import { CharacterSet, PrinterTypes, ThermalPrinter } from 'node-thermal-printer';
import { DataElement, Product, Transaction } from '../hooks/useData';
import { formatFrenchDate, generateReceiptNumber } from './date';

type ReceiptData = {
    shopName: string;
    shopEmail: string;
    products: Product[];
    total: number;
    currency: string;
    paymentMethod?: string;
    thanksMessage?: string;
};

type SummaryData = {
    shopName: string;
    shopEmail: string;
    currency: string;
    period: string;
    transactions: Transaction[];
    summary: string[];
};

type PrintResponse = {
    success?: boolean;
    error?: string;
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
 * Formats an amount to a string with the specified currency
 */
const toCurrency = (amount: number, currency: string) => amount.toFixed(2) + (currency === '€' ? '$' : currency);

/**
 * Server action to print a receipt with standard formatting
 */
export async function printReceipt(printerIPAddress: string, receiptData: ReceiptData): Promise<PrintResponse> {
    try {
        const printer = await getPrinter(printerIPAddress);
        if (!printer) return { error: 'Imprimante non connectée' };

        const currentDate = new Date();
        const receiptNumber = generateReceiptNumber('R', currentDate);
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        // Print header
        printer.alignCenter();
        printer.bold(true);
        printer.println(receiptData.shopName.toUpperCase());
        printer.bold(false);
        printer.println(`Email : ${receiptData.shopEmail}`);
        printer.println(`Date : ${frenchDateStr} ${frenchTimeStr}`);
        printer.println(`N° de reçu : ${receiptNumber}`);
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
        receiptData.products.forEach((item) => {
            let label =
                item.label +
                (item.quantity !== 1 ? ` x${item.quantity}` : '') +
                (item.discount.value > 0 ? ` (-${item.discount.value}${item.discount.unit})` : '');
            const labelLength = label.length;
            label = labelLength > 32 ? item.label.slice(0, 32 - labelLength) + label.slice(item.label.length) : label;
            printer.tableCustom([
                { text: label, align: 'LEFT', cols: 32 },
                { text: toCurrency(item.amount || 0, receiptData.currency), align: 'CENTER', cols: 8 },
                { text: toCurrency(item.total || 0, receiptData.currency), align: 'RIGHT', cols: 8 },
            ]);
        });

        // Print total
        printer.newLine();
        printer.drawLine();
        printer.bold(true);
        printer.leftRight('TOTAL', toCurrency(receiptData.total, receiptData.currency));
        printer.bold(false);
        printer.drawLine();

        // Print payment method if available
        printer.alignCenter();
        printer.println(
            receiptData.paymentMethod ? `Mode de paiement: ${receiptData.paymentMethod}` : 'PAS ENCORE PAYÉ'
        );
        printer.newLine();

        // Print thank you message
        printer.alignCenter();
        printer.println(
            receiptData.paymentMethod
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
export async function printSummary(printerIPAddress: string, summaryData: SummaryData): Promise<PrintResponse> {
    try {
        const printer = await getPrinter(printerIPAddress);
        if (!printer) return { error: 'Imprimante non connectée' };

        const currentDate = new Date();
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        // Calculate average ticket amount
        const transactionCount = summaryData.transactions.length;
        const totalAmount = summaryData.transactions.reduce((total, transaction) => total + transaction.amount, 0);
        const averageTicket = transactionCount > 0 ? totalAmount / transactionCount : 0;
        const shopName = summaryData.shopName;

        // Create a simpler header for the ticket
        printer.alignCenter();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.invert(true);
        printer.println('                    Ticket Z                    ');
        printer.invert(false);
        printer.newLine();
        printer.println(shopName.toUpperCase());
        printer.bold(false);
        printer.setTextNormal();
        printer.newLine();
        printer.println('Adresse');
        printer.println('Code postal et ville');
        printer.println('N° SIRET');
        printer.newLine();

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
        printer.println(`Ticket moyen : ${toCurrency(averageTicket, summaryData.currency)}`);
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
                printer.leftRight(
                    line.split('==>')[0].trim(),
                    toCurrency(
                        Number(line.split('==>')[1].replace(summaryData.currency, '').trim()),
                        summaryData.currency
                    )
                );
            } else if (line.includes('\n'))
                printer.table(
                    line
                        .split('\n')
                        .map((s) =>
                            s.includes(summaryData.currency)
                                ? toCurrency(Number(s.replace(summaryData.currency, '').trim()), summaryData.currency)
                                : s.trim()
                        )
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
        printer.leftRight('TOTAL TTC', toCurrency(totalAmount, summaryData.currency));
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
