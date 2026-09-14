import { networkInterfaces } from 'os';
import { getShopIdFromRequest } from '@/app/constants/shop';
import { assertDeviceAuthorized } from '../sql/deviceAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const deviceGuard = await assertDeviceAuthorized(request, getShopIdFromRequest(request));
    if (deviceGuard) return deviceGuard;
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
