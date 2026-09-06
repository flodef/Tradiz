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

        let responseData = '';

        socket.setTimeout(TIMEOUT_MS);

        socket.on('connect', () => {
            socket.write(message, 'ascii');
        });

        socket.on('data', (data: Buffer) => {
            responseData += data.toString('ascii');
            // The Caisse-AP protocol doesn't have a delimiter; the response is a single
            // message. We close after receiving data.
            socket.end();
        });

        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('TPE connection timeout'));
        });

        socket.on('error', (err: Error) => {
            reject(new Error(`TPE connection error: ${err.message}`));
        });

        socket.on('close', () => {
            if (responseData) {
                resolve(responseData);
            } else {
                reject(new Error('TPE connection closed without response'));
            }
        });

        socket.connect(port, ip);
    });
}
