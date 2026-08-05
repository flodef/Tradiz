import { networkInterfaces } from 'os';
import net from 'net';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getLocalIp(): string | null {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (interfaces[name]) {
            for (const iface of interfaces[name]) {
                if (
                    iface.family === 'IPv4' &&
                    !iface.internal &&
                    (iface.address.startsWith('192.168.') || iface.address.startsWith('10.10.'))
                ) {
                    return iface.address;
                }
            }
        }
    }
    return null;
}

function checkPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
}

export async function GET() {
    const localIp = getLocalIp();
    if (!localIp) {
        return new Response(JSON.stringify({ error: 'Aucune adresse IP locale trouvée' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const parts = localIp.split('.');
    const baseIp = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const printerPort = 9100;
    const timeoutMs = 800;
    const total = 254;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let scanned = 0;

            const sendEvent = (event: string, data: unknown) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            sendEvent('start', { localIp, subnet: `${baseIp}.0/24`, total });

            const promises: Promise<void>[] = [];
            for (let i = 1; i <= total; i++) {
                const host = `${baseIp}.${i}`;
                promises.push(
                    checkPort(host, printerPort, timeoutMs).then((isOpen) => {
                        scanned++;
                        if (isOpen) {
                            sendEvent('printer', { ip: host, label: `Imprimante ${host}` });
                        }
                        if (scanned % 10 === 0 || scanned === total) {
                            sendEvent('progress', { scanned, total });
                        }
                    })
                );
            }

            await Promise.all(promises);
            sendEvent('done', { total });
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
