import html2canvas from 'html2canvas';

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
 * Formats a date in French format with standard options for receipts
 */
const formatFrenchDate = (date: Date = new Date()) => {
    const frenchDateStr = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);

    const frenchTimeStr = new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);

    return { frenchDateStr, frenchTimeStr };
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
 * Creates a receipt template with common elements
 */
export const createReceiptTemplate = (
    shopName: string,
    shopEmail: string,
    items: Array<{ description: string; qty: number; price: number }>,
    total: number,
    currency: string,
    paymentMethod: string | undefined,
    additionalInfo?: string,
    thanksMessage?: string
): string => {
    const currentDate = new Date();
    const receiptNumber = generateReceiptNumber('R', currentDate);
    const { frenchDateStr, frenchTimeStr } = formatFrenchDate(currentDate);

    let content = `
${shopName.toUpperCase()}
Email : ${shopEmail}
Date : ${frenchDateStr} ${frenchTimeStr}
N° de reçu : ${receiptNumber}

----------------------------------------
ARTICLE             QTÉ     PRIX
----------------------------------------
`;

    for (const item of items) {
        // Format each item line (simplified)
        const description = item.description.padEnd(20).substring(0, 20);
        const qty = item.qty.toString().padStart(4);
        const price = item.price.toFixed(2).padStart(8);
        content += `${description} ${qty} ${price} ${currency}\n`;
    }

    content += `
----------------------------------------
TOTAL:                      ${total.toFixed(2)} ${currency}
----------------------------------------
`;

    // Only show payment method if it exists
    if (paymentMethod) {
        content += `Mode de paiement: ${paymentMethod}\n`;
    }

    content += `\n`;

    // Only add additional info if it exists and doesn't contain 'Monnaie' or 'Vendeur'
    if (additionalInfo) {
        content += `${additionalInfo}\n\n`;
    }

    // Use thanksMessage if provided, otherwise default to thank you message
    content += `${thanksMessage || 'Merci pour votre achat!'}`;

    return content;
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
 * Print content using the browser's print functionality
 */
export const printContent = async (
    content: PrintContent | PrintContent[],
    config: PrinterConfig = DEFAULT_PRINTER_CONFIG
): Promise<void> => {
    // Create a container for the print content
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    document.body.appendChild(printContainer);

    try {
        // Create the print element
        const printElement = createPrintElement(config);
        printContainer.appendChild(printElement);

        // Add all content to the print element
        const contentArray = Array.isArray(content) ? content : [content];
        for (const item of contentArray) {
            addContentToPrintElement(printElement, item, config);
        }

        // Create a new window for printing instead of an iframe
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            console.error('Unable to open print window. Popup may be blocked.');
            return;
        }

        // Convert the print element to an image
        const canvas = await html2canvas(printElement);
        const imageDataUrl = canvas.toDataURL('image/png');

        // Write the HTML content to the new window
        printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Receipt</title>
            <style>
              @page {
                margin: 0;
                size: ${config.width}mm ${config.autoSize ? 'auto' : config.height + 'mm'};
              }
              body {
                margin: 0;
                padding: 0;
                text-align: center;
                background-color: white;
                color: black;
              }
              img {
                width: 100%;
                max-width: ${config.width}mm;
                display: block;
                margin: 0 auto;
              }
              @media print {
                body { 
                  color: black !important; 
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
              }
            </style>
          </head>
          <body>
            <img src="${imageDataUrl}" />
            <script>
              // Print immediately when loaded
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  setTimeout(function() {
                    window.close();
                  }, 500);
                }, 200);
              };
            </script>
          </body>
        </html>
      `);
        printWindow.document.close();

        return new Promise<void>((resolve) => {
            // Set up an event to handle when the window is closed
            const checkWindowClosed = setInterval(() => {
                if (printWindow.closed) {
                    clearInterval(checkWindowClosed);
                    resolve();
                }
            }, 500);
        });
    } finally {
        // Clean up
        if (printContainer.parentNode) {
            printContainer.parentNode.removeChild(printContainer);
        }
    }
};

/**
 * Creates a hook for using the POS printer
 */
export const usePOSPrinter = (config: PrinterConfig = DEFAULT_PRINTER_CONFIG) => {
    return {
        /**
         * Print raw text
         */
        printText: (text: string) => printContent({ text }, config),

        /**
         * Print a receipt with standard formatting
         */
        printReceipt: (receiptData: {
            shopName?: string;
            shopEmail: string;
            items: Array<{ description: string; qty: number; price: number }>;
            total: number;
            currency: string;
            paymentMethod?: string;
            additionalInfo?: string;
            thanksMessage?: string;
            qrCode?: string;
        }) => {
            const shopName = receiptData.shopName || 'Tradiz Shop';

            const content = createReceiptTemplate(
                shopName,
                receiptData.shopEmail,
                receiptData.items,
                receiptData.total,
                receiptData.currency,
                receiptData.paymentMethod,
                receiptData.additionalInfo,
                receiptData.thanksMessage
            );

            const printItems: PrintContent[] = [{ text: content }];

            // Add QR code if provided
            if (receiptData.qrCode) {
                printItems.push({ qrCode: receiptData.qrCode });
            }

            return printContent(printItems, config);
        },

        /**
         * Print an image
         */
        printImage: (imageUrl: string) => printContent({ image: imageUrl }, config),

        /**
         * Print QR code
         */
        printQRCode: (content: string) => printContent({ qrCode: content }, config),

        /**
         * Print barcode
         */
        printBarcode: (content: string) => printContent({ barcode: content }, config),

        /**
         * Print custom content
         */
        print: (content: PrintContent | PrintContent[]) => printContent(content, config),

        /**
         * Print a Ticket Z summary (Z report)
         */
        printTicketZ: (ticketZData: {
            shopName: string;
            shopEmail: string;
            currency: string;
            period: string;
            totalAmount: number;
            transactionCount: number;
            summary: string[];
            thanksMessage?: string;
        }) => {
            const content = createTicketZTemplate(
                ticketZData.shopName,
                ticketZData.shopEmail,
                ticketZData.currency,
                ticketZData.period,
                ticketZData.totalAmount,
                ticketZData.transactionCount,
                ticketZData.summary
            );

            return printContent({ text: content }, config);
        },
    };
};
