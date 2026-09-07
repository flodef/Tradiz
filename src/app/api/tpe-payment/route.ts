import { NextResponse } from 'next/server';
import net from 'net';
import {
    encodeCaisseApMessage,
    decodeCaisseApMessage,
    buildPaymentRequest,
    parsePaymentResponse,
    isCompleteTlvMessage,
} from '@/app/utils/caisseAp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for the TPE to process

interface TpePaymentRequestBody {
    amount: number;
    tpeIp: string;
    tpePort: number;
    isReimbursement?: boolean;
    isCheck?: boolean;
}

export async function POST(request: Request) {
    let body: TpePaymentRequestBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { amount, tpeIp, tpePort, isReimbursement, isCheck } = body;

    if (!tpeIp || !tpePort) {
        return NextResponse.json({ error: 'TPE IP and port are required' }, { status: 400 });
    }
    // Reject non-finite, zero, or negative amounts. Previously only NaN was
    // rejected, allowing Infinity to pass validation and be sent to the terminal
    // as the literal string "Infinity".
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Amount must be a positive finite number' }, { status: 400 });
    }

    const msg = buildPaymentRequest({
        amount,
        isReimbursement,
        isCheck,
    });

    const encoded = encodeCaisseApMessage(msg);

    try {
        const result = await sendToTpe(tpeIp, tpePort, encoded);
        const parsed = parsePaymentResponse(decodeCaisseApMessage(result));
        return NextResponse.json(parsed);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = message.includes('timeout') || message.includes('Timeout');
        return NextResponse.json(
            {
                success: false,
                errorCode: isTimeout ? 'TIMEOUT' : 'CONNECTION_ERROR',
                errorDetail: message,
                raw: {},
            },
            { status: isTimeout ? 504 : 502 }
        );
    }
}

function sendToTpe(ip: string, port: number, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        // Derive the socket timeout from maxDuration (minus a 5s margin) so the
        // socket always times out before the platform kills the request. The
        // previous 180s timeout was unreachable on Vercel (maxDuration=60),
        // causing the platform to kill the request while the TPE was still
        // processing — the POS reported failure for a payment that succeeded.
        const TIMEOUT_MS = Math.min((maxDuration - 5) * 1000, 175_000);
        const IDLE_AFTER_DATA_MS = 500; // grace period after data before closing

        let responseData = '';
        let receivedData = false;
        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        socket.setTimeout(TIMEOUT_MS);

        socket.on('connect', () => {
            socket.write(message, 'ascii');
        });

        socket.on('data', (data: Buffer) => {
            responseData += data.toString('ascii');
            receivedData = true;
            // The Caisse-AP protocol is self-delimiting (TLV: each field
            // carries its own 3-digit length). Check if the response is
            // complete by walking the TLV stream. If it is, close immediately
            // rather than waiting for the idle timer.
            if (isCompleteTlvMessage(responseData)) {
                if (idleTimer) clearTimeout(idleTimer);
                socket.end();
                return;
            }
            // Fallback: if TLV completeness can't be determined (e.g. partial
            // field), use the idle timer as before.
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                socket.end();
            }, IDLE_AFTER_DATA_MS);
        });

        socket.on('timeout', () => {
            if (idleTimer) clearTimeout(idleTimer);
            socket.destroy();
            reject(new Error('TPE connection timeout'));
        });

        socket.on('error', (err: Error) => {
            if (idleTimer) clearTimeout(idleTimer);
            socket.destroy();
            reject(new Error(`TPE connection error: ${err.message}`));
        });

        socket.on('close', () => {
            if (idleTimer) clearTimeout(idleTimer);
            if (receivedData && responseData) {
                resolve(responseData);
            } else {
                reject(new Error('TPE connection closed without response'));
            }
        });

        socket.connect(port, ip);
    });
}
