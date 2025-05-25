import { NextResponse } from 'next/server';
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { formatFrenchDate, generateReceiptNumber } from '@/app/utils/date';
import { Discount } from '@/app/hooks/useConfig';

type Item = {
    label: string;
    quantity: number;
    amount: number;
    discount: Discount;
    total: number;
};

export async function POST(request: Request) {
    try {
        const { printerIPAddress, receiptData } = await request.json();

        // Create printer instance
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: 'tcp://' + printerIPAddress,
            width: 48, // 48 characters per line
            characterSet: CharacterSet.PC437_USA,
            removeSpecialCharacters: false,
            lineCharacter: '-',
        });

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) return NextResponse.json({ error: 'Printer not connected' }, { status: 500 });

        // Get current date and receipt number
        const currentDate = new Date();
        const receiptNumber = generateReceiptNumber('R', currentDate);
        const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

        const toCurrency = (amount: number) =>
            amount.toFixed(2) + (receiptData.currency === '€' ? '$' : receiptData.currency);

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
        receiptData.products.forEach((item: Item) => {
            let label =
                item.label +
                (item.quantity !== 1 ? ` x${item.quantity}` : '') +
                (item.discount.value > 0 ? ` (-${item.discount.value}${item.discount.unit})` : '');
            const labelLength = label.length;
            label = labelLength > 32 ? item.label.slice(0, 32 - labelLength) + label.slice(item.label.length) : label;
            printer.tableCustom([
                { text: label, align: 'LEFT', cols: 32 },
                { text: toCurrency(item.amount), align: 'RIGHT', cols: 8 },
                { text: toCurrency(item.total), align: 'RIGHT', cols: 8 },
            ]);
        });

        // Print total
        printer.newLine();
        printer.drawLine();
        printer.bold(true);
        printer.leftRight('TOTAL', toCurrency(receiptData.total));
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
        return NextResponse.json({ message: 'Print successful' });
    } catch (error) {
        console.error('Print error:', error);
        return NextResponse.json({ error: 'Failed to print' }, { status: 500 });
    }
}
