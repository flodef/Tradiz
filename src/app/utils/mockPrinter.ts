'use server';

import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';

// Create a mock printer for DEV environment that generates plain text output
export const createMockPrinter = async () => {
    const MAX_WIDTH = 48; // Characters per line
    let textBuffer: string[] = [];
    let currentAlign = 'left';
    let isBold = false;
    let isDoubleHeight = false;
    let isInverted = false;

    // Helper function to center text within MAX_WIDTH chars
    const centerText = (text: string): string => {
        const padding = Math.max(0, Math.floor((MAX_WIDTH - text.length) / 2));
        return ' '.repeat(padding) + text;
    };

    // Helper function to right-align text within MAX_WIDTH chars
    const rightAlignText = (text: string): string => {
        const padding = Math.max(0, MAX_WIDTH - text.length);
        return ' '.repeat(padding) + text;
    };

    // Helper function to format and add a line of text according to current formatting
    const addFormattedLine = (text: string) => {
        let formattedText = text;

        // Apply styling indicators for better visibility
        if (isBold) formattedText = `** ${formattedText} **`;
        if (isDoubleHeight) formattedText = `## ${formattedText} ##`;
        if (isInverted) formattedText = `[INV] ${formattedText} [/INV]`;

        // Apply alignment
        if (currentAlign === 'center') formattedText = centerText(formattedText);
        if (currentAlign === 'right') formattedText = rightAlignText(formattedText);

        textBuffer.push(formattedText);
    };

    // Create a mock object that mimics the ThermalPrinter interface
    return {
        printerTypes: PrinterTypes.EPSON,
        width: MAX_WIDTH,
        characterSet: CharacterSet.PC437_USA,
        removeSpecialCharacters: false,
        lineCharacter: '-',
        options: {},
        adapter: null,
        buffer: [],
        printer: null,
        types: PrinterTypes.EPSON,
        interface: '',
        // Mock basic printer methods with text equivalents
        println: (text: string) => {
            addFormattedLine(text);
            return Promise.resolve();
        },
        print: (text: string) => {
            // For print (without newline), add to the last line if exists or create new line
            if (textBuffer.length === 0) {
                textBuffer.push(text);
            } else {
                textBuffer[textBuffer.length - 1] += text;
            }
            return Promise.resolve();
        },
        newLine: () => {
            textBuffer.push('');
            return Promise.resolve();
        },
        drawLine: () => {
            textBuffer.push('-'.repeat(MAX_WIDTH));
            return Promise.resolve();
        },
        tableCustom: (columns: Array<{ text: string; align: string; cols: number }>) => {
            // Calculate how many characters each column gets based on relative widths
            const totalCols = columns.reduce((sum, col) => sum + col.cols, 0);
            const colWidths = columns.map((col) => Math.floor((col.cols / totalCols) * MAX_WIDTH));

            // Create a row with proper spacing
            let row = '';
            columns.forEach((col, i) => {
                const width = colWidths[i];
                let cellText = col.text;

                // Apply alignment within the cell
                if (cellText.length > width) {
                    cellText = cellText.substring(0, width);
                } else {
                    const padding = width - cellText.length;
                    if (col.align.toLowerCase() === 'right') {
                        cellText = ' '.repeat(padding) + cellText;
                    } else if (col.align.toLowerCase() === 'center') {
                        const leftPad = Math.floor(padding / 2);
                        cellText = ' '.repeat(leftPad) + cellText + ' '.repeat(padding - leftPad);
                    } else {
                        // left align
                        cellText = cellText + ' '.repeat(padding);
                    }
                }

                row += cellText;
            });

            textBuffer.push(row);
            return Promise.resolve();
        },
        table: (data: string[]) => {
            // Simple equal-width columns
            const colWidth = Math.floor(MAX_WIDTH / data.length);
            let row = '';

            data.forEach((text) => {
                let cellText = text;
                if (cellText.length > colWidth) {
                    cellText = cellText.substring(0, colWidth);
                } else {
                    cellText = cellText + ' '.repeat(colWidth - cellText.length);
                }
                row += cellText;
            });

            textBuffer.push(row);
            return Promise.resolve();
        },
        leftRight: (left: string, right: string) => {
            const totalLength = left.length + right.length;
            if (totalLength > MAX_WIDTH) {
                // Truncate if too long
                if (left.length > MAX_WIDTH / 2) {
                    left = left.substring(0, MAX_WIDTH / 2 - 3) + '...';
                }
                if (right.length > MAX_WIDTH / 2) {
                    right = right.substring(0, MAX_WIDTH / 2 - 3) + '...';
                }
            }

            const padding = Math.max(1, MAX_WIDTH - totalLength);
            textBuffer.push(left + ' '.repeat(padding) + right);
            return Promise.resolve();
        },
        alignLeft: () => {
            currentAlign = 'left';
            return Promise.resolve();
        },
        alignCenter: () => {
            currentAlign = 'center';
            return Promise.resolve();
        },
        alignRight: () => {
            currentAlign = 'right';
            return Promise.resolve();
        },
        setTextDoubleHeight: () => {
            isDoubleHeight = true;
            return Promise.resolve();
        },
        setTextNormal: () => {
            isDoubleHeight = false;
            return Promise.resolve();
        },
        bold: (enable: boolean) => {
            isBold = enable;
            return Promise.resolve();
        },
        invert: (enable: boolean) => {
            isInverted = enable;
            return Promise.resolve();
        },
        cut: () => Promise.resolve(),
        execute: () => {
            console.log('\n=== PRINTER MOCKUP (DEV MODE) ===');
            console.log('Receipt:');
            console.log('|' + '='.repeat(MAX_WIDTH + 2) + '|');
            textBuffer.forEach((line) => {
                console.log('| ' + line.padEnd(MAX_WIDTH) + ' |');
            });
            console.log('|' + '='.repeat(MAX_WIDTH + 2) + '|');

            console.log('In dev mode, printer output is shown above instead of printing to a physical device.');

            return Promise.resolve();
        },
        // Implement all other required methods as no-ops
        partialCut: () => Promise.resolve(),
        beep: () => Promise.resolve(),
        getWidth: () => 48,
        getText: () => '',
        clear: () => Promise.resolve(),
        isPrinterConnected: () => Promise.resolve(true),
        write: () => Promise.resolve(),
        upsideDown: () => Promise.resolve(),
        underline: () => Promise.resolve(),
        underlineThick: () => Promise.resolve(),
        setTypeFontA: () => Promise.resolve(),
        setTypeFontB: () => Promise.resolve(),
        setBarcodeHeight: () => Promise.resolve(),
        setBarcodeWidth: () => Promise.resolve(),
        setBarcodeTextPosition: () => Promise.resolve(),
        barcode: () => Promise.resolve(),
        qrCode: () => Promise.resolve(),
        qrImage: () => Promise.resolve(),
        image: () => Promise.resolve(),
        raster: () => Promise.resolve(),
        imageRaster: () => Promise.resolve(),
        printQR: () => Promise.resolve(),
        code128: () => Promise.resolve(),
        setCharacterSet: () => Promise.resolve(),
        openCashDrawer: () => Promise.resolve(),
    } as unknown as ThermalPrinter;
};
