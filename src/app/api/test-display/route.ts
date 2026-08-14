import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';

export const dynamic = 'force-dynamic';

// ESC/POS display commands (same as electron/main.js)
const DISPLAY_INIT = Buffer.from([0x1b, 0x40]); // ESC @ — initialize/clear screen

interface PortResult {
    port: string;
    available: boolean;
    written: boolean;
    error?: string;
}

/**
 * Scans all available COM ports and sends a test message to each one
 * (except COM1, which is the cashier printer).
 *
 * For each port, configures serial settings with the Windows `mode` command
 * and writes an ESC/POS display test: "TEST COMx" on line 1, "DISPLAY OK" on line 2.
 *
 * The user checks which port makes the customer display light up.
 */
export async function GET() {
    const results: PortResult[] = [];

    for (let i = 1; i <= 16; i++) {
        const portName = `COM${i}`;
        const path = `\\\\.\\${portName}`;

        // Check if port exists
        try {
            const fd = fs.openSync(path, 'r');
            fs.closeSync(fd);
        } catch {
            continue; // Port doesn't exist, skip
        }

        const result: PortResult = { port: portName, available: true, written: false };

        // Skip COM1 (cashier printer — don't want to send display commands to it)
        if (i === 1) {
            result.written = false;
            result.error = 'Skipped (COM1 = cashier printer)';
            results.push(result);
            continue;
        }

        try {
            // Configure serial settings: 9600 baud, 8N1, no flow control
            execSync(`mode ${portName}: BAUD=9600 PARITY=N DATA=8 STOP=1 to=off xon=off odsr=off octs=off dtr=on rts=on`, {
                stdio: 'pipe',
                windowsHide: true,
            });

            // Build test message: ESC @ + 20 chars line1 + 20 chars line2
            const line1 = `TEST ${portName}`.slice(0, 20).padEnd(20, ' ');
            const line2 = 'DISPLAY OK'.slice(0, 20).padEnd(20, ' ');
            const buf = Buffer.concat([DISPLAY_INIT, Buffer.from(line1, 'latin1'), Buffer.from(line2, 'latin1')]);

            const fd = fs.openSync(path, 'r+');
            try {
                fs.writeSync(fd, buf, 0, buf.length, null);
                result.written = true;
            } finally {
                fs.closeSync(fd);
            }
        } catch (err) {
            result.error = (err as Error).message.slice(0, 200);
        }

        results.push(result);
    }

    return NextResponse.json({ results });
}
