import { networkInterfaces } from 'os';

export const dynamic = 'force-dynamic';

export function GET() {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (interfaces[name]) {
            for (const iface of interfaces[name]) {
                if (
                    iface.family === 'IPv4' &&
                    !iface.internal &&
                    (iface.address.startsWith('192.168.') || iface.address.startsWith('10.10.'))
                ) {
                    return new Response(JSON.stringify({ localIp: iface.address }), {
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
            }
        }
    }
    return new Response(JSON.stringify({ localIp: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
