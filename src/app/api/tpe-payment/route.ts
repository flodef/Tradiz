import { NextResponse } from 'next/server';
import net from 'net';
import {
    encodeCaisseApMessage,
    decodeCaisseApMessage,
    buildPaymentRequest,
    parsePaymentResponse,
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
    if (typeof amount !== 'number' || isNaN(amount)) {
        return NextResponse.json({ error: 'Amount must be a number' }, { status: 400 });
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
        const TIMEOUT_MS = 180_000; // 3 minutes, matching the Python client default
        const IDLE_AFTER_DATA_MS = 500; // grace period after first data before closing

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
            // The Caisse-AP protocol has no delimiter. After the first data
            // chunk arrives, set a short idle timer. If no more data arrives
            // within the grace period, we assume the response is complete.
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
