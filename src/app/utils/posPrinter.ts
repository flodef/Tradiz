import { formatFrenchDate } from '@/app/utils/date';
import { Product } from '../hooks/useData';

interface PrinterConfig {
    width: number; // Width in mm
    height?: number; // Height in mm (optional, for fixed-height receipts)
    dpi: number; // Dots per inch
    characterWidth: number; // Characters per line for text mode
    autoSize?: boolean; // Whether to auto-size the height based on content
}

interface PrintContent {
    text?: string;
    html?: string;
    image?: string; // Base64 encoded image
    qrCode?: string; // Content to encode as QR
    barcode?: string; // Content to encode as barcode
    style?: React.CSSProperties;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
    width: 80, // 80mm printer width
    height: 297, // A4 height as fallback
    dpi: 203, // Standard for most 80mm POS printers
    characterWidth: 42, // Standard for most 80mm POS printers at default font size
    autoSize: true, // Auto-size height based on content
};

/**
 * Converts millimeters to pixels based on the specified DPI
 */
const mmToPixels = (mm: number, dpi: number): number => {
    // 1 inch = 25.4 mm, so pixels = (mm / 25.4) * dpi
    return Math.round((mm / 25.4) * dpi);
};

/**
 * Generates a unique receipt number based on timestamp
 */
const generateReceiptNumber = (prefix: string = 'R', date: Date = new Date()): string => {
    return `${prefix}-${date.getTime().toString().slice(-8)}`;
};

/**
 * Creates a print-ready element based on the printer configuration
 */
const createPrintElement = (config: PrinterConfig = DEFAULT_PRINTER_CONFIG): HTMLDivElement => {
    const widthInPixels = mmToPixels(config.width, config.dpi);

    const printElement = document.createElement('div');
    printElement.style.width = `${widthInPixels}px`;
    printElement.style.fontFamily = 'monospace';
    printElement.style.fontSize = '12px';
    printElement.style.lineHeight = '1.2';
    printElement.style.whiteSpace = 'pre-wrap';
    printElement.style.boxSizing = 'border-box';
    printElement.style.padding = '5px';
    printElement.style.color = '#000'; // Explicitly set text color to black

    return printElement;
};

/**
 * Generate a QR code as an SVG element (simplified implementation)
 * In production, use a dedicated library for QR code generation
 */
const generateQRCode = (content: string, size: number = 200): HTMLElement => {
    const qrDiv = document.createElement('div');
    qrDiv.style.width = `${size}px`;
    qrDiv.style.height = `${size}px`;
    qrDiv.style.margin = '0 auto 10px auto';
    qrDiv.style.textAlign = 'center';
    qrDiv.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">Scan QR Code:</div>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(content)}" 
        width="${size}" height="${size}" alt="QR Code" />
  `;
    return qrDiv;
};

/**
 * Generate a barcode (simplified implementation)
 * In production, use a dedicated library for barcode generation
 */
const generateBarcode = (content: string, width: number = 200, height: number = 80): HTMLElement => {
    const barcodeDiv = document.createElement('div');
    barcodeDiv.style.width = `${width}px`;
    barcodeDiv.style.height = `${height}px`;
    barcodeDiv.style.margin = '0 auto 10px auto';
    barcodeDiv.style.textAlign = 'center';
    barcodeDiv.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">Barcode:</div>
    <img src="https://barcodeapi.org/api/code128/${encodeURIComponent(content)}" 
        width="${width}" height="${height}" alt="Barcode" />
  `;
    return barcodeDiv;
};

/**
 * Format text for a receipt with proper line wrapping based on character width
 */
const formatReceiptText = (text: string, charWidth: number): string => {
    const lines = text.split('\n');
    const formattedLines = lines.map((line) => {
        if (line.length <= charWidth) return line;

        // Basic word wrapping
        const words = line.split(' ');
        let currentLine = '';
        let result = '';

        for (const word of words) {
            if ((currentLine + word).length <= charWidth) {
                currentLine += currentLine ? ' ' + word : word;
            } else {
                result += currentLine + '\n';
                currentLine = word;
            }
        }

        if (currentLine) result += currentLine;
        return result;
    });

    return formattedLines.join('\n');
};

/**
 * Add content to the print element
 */
const addContentToPrintElement = (
    printElement: HTMLDivElement,
    content: PrintContent,
    config: PrinterConfig = DEFAULT_PRINTER_CONFIG
): void => {
    // Apply custom styles if provided
    if (content.style) {
        Object.assign(printElement.style, content.style);
    }

    // Add text content with proper formatting
    if (content.text) {
        const formattedText = formatReceiptText(content.text, config.characterWidth);
        const textDiv = document.createElement('div');
        textDiv.style.whiteSpace = 'pre-wrap';
        textDiv.textContent = formattedText;
        printElement.appendChild(textDiv);
    }

    // Add HTML content
    if (content.html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content.html;
        printElement.appendChild(tempDiv);
    }

    // Add image
    if (content.image) {
        const img = document.createElement('img');
        img.src = content.image;
        img.style.maxWidth = '100%';
        img.style.display = 'block';
        img.style.margin = '10px auto';
        printElement.appendChild(img);
    }

    // Add QR code
    if (content.qrCode) {
        const qrSize = Math.min(mmToPixels(50, config.dpi), mmToPixels(config.width - 10, config.dpi));
        const qrElement = generateQRCode(content.qrCode, qrSize);
        printElement.appendChild(qrElement);
    }

    // Add barcode
    if (content.barcode) {
        const barcodeWidth = mmToPixels(config.width - 10, config.dpi);
        const barcodeHeight = mmToPixels(15, config.dpi);
        const barcodeElement = generateBarcode(content.barcode, barcodeWidth, barcodeHeight);
        printElement.appendChild(barcodeElement);
    }
};

/**
 * Creates a template specifically for Ticket Z (Z report) summary
 * This is different from a regular receipt as it summarizes all transactions
 */
export const createTicketZTemplate = (
    shopName: string,
    shopEmail: string,
    currency: string,
    period: string,
    totalAmount: number,
    transactionCount: number,
    summary: string[]
): string => {
    const currentDate = new Date();
    const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

    // Calculate average ticket amount
    const averageTicket = transactionCount > 0 ? (totalAmount / transactionCount).toFixed(2) : '0.00';

    // Create a simpler header for the ticket
    let content = `
Ticket Z

${shopName.toUpperCase()}

Adresse
Code postal et ville
N° SIRET

`;

    // Use current date for printing date and opening/closing times
    content += `Date d'impression : ${frenchDateStr} ${frenchTimeStr}\n`;
    content += `Ouverture :        ${frenchDateStr} 00:00:00\n`;
    content += `Clôture :          ${frenchDateStr} ${frenchTimeStr}\n\n`;

    // Commands and clients
    content += `Commandes : ${transactionCount}      Clients : ${transactionCount}\n`;
    content += `Ticket moyen : ${averageTicket} ${currency}\n\n`;

    // Separator line
    content += `${'-'.repeat(60)}\n\n`;

    // Instead of trying to parse the payment methods (which didn't work),
    // add a simplified tax section
    content += `TAUX\nHT\nTVA\nTTC\n`;
    content += `TOTAL HT${' '.repeat(20)}${totalAmount.toFixed(2)} ${currency}\n\n`;

    // Separator line
    content += `${'-'.repeat(60)}\n\n`;

    // Total TTC
    content += `TOTAL TTC${' '.repeat(20)}${totalAmount.toFixed(2)} ${currency}\n\n`;

    // Separator line
    content += `${'-'.repeat(60)}\n\n`;

    // Add remises and annulations on single lines each
    content += `TOTAL Remises & Offerts${' '.repeat(20)}0.00 ${currency}\n`;
    content += `TOTAL Annulations${' '.repeat(24)}0.00 ${currency}\n\n`;

    // Add cash drawer info with proper spacing and same line formatting
    content += `Fond de caisse initial${' '.repeat(20)}100.00 ${currency}\n`;
    content += `Fond de caisse final${' '.repeat(22)}${(100 + totalAmount).toFixed(2)} ${currency}\n`;
    content += `Solde total des comptes clients${' '.repeat(10)}0.00 ${currency}`;

    return content;
};

/**
 * Creates a hook for using the POS printer
 */
export const usePOSPrinter = (config: PrinterConfig = DEFAULT_PRINTER_CONFIG) => {
    return {
        /**
         * Print a receipt with standard formatting
         */
        printReceipt: async (
            printerIPAddress: string,
            receiptData: {
                shopName: string;
                shopEmail: string;
                products: Product[];
                total: number;
                currency: string;
                paymentMethod?: string;
                thanksMessage?: string;
            }
        ) => {
            try {
                const response = await fetch('/api/print/receipt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ printerIPAddress, receiptData }),
                });
                return await response.json();
            } catch (error) {
                console.error('Failed to print ticket:', error);
                return { error: 'Failed to print ticket' };
            }
        },

        /**
         * Print a Ticket Z summary (Z report)
         */
        printSummary: async (
            printerIPAddress: string,
            summaryData: {
                shopName: string;
                shopEmail: string;
                currency: string;
                period: string;
                totalAmount: number;
                transactionCount: number;
                summary: string[];
                thanksMessage?: string;
            }
        ) => {
            try {
                const response = await fetch('/api/print/summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ printerIPAddress, summaryData }),
                });
                return await response.json();
            } catch (error) {
                console.error('Failed to print ticket:', error);
                return { error: 'Failed to print ticket' };
            }
        },
    };
};
