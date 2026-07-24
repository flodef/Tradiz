'use client';

import { useEffect, useState } from 'react';

export default function MiniPage() {
    const [message, setMessage] = useState<string>('Bienvenue');
    const [total, setTotal] = useState<string>('');
    const [change, setChange] = useState<string>('');

    useEffect(() => {
        const update = (data: unknown) => {
            if (typeof data === 'string') {
                setMessage(data);
                setTotal('');
                setChange('');
                return;
            }

            if (data && typeof data === 'object') {
                const {
                    message: msg,
                    total: t,
                    change: c,
                } = data as { message?: string; total?: string; change?: string };
                if (msg) setMessage(msg);
                if (t !== undefined) setTotal(t);
                if (c !== undefined) setChange(c);
            }
        };

        let cleanup: (() => void) | undefined;

        if (window.electronAPI?.onMiniMessage) {
            cleanup = window.electronAPI.onMiniMessage(update);
        } else if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('tradiz-mini');
            channel.onmessage = (event) => update(event.data);
            cleanup = () => channel.close();
        }

        return () => cleanup?.();
    }, []);

    return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-black text-white overflow-hidden p-8">
            <div className="text-center">
                <h1 className="text-5xl md:text-7xl font-bold font-mono mb-8 whitespace-pre-wrap">{message}</h1>
                {total && (
                    <div className="text-3xl md:text-5xl font-mono mt-4">
                        TOTAL: <span className="font-bold">{total}</span>
                    </div>
                )}
                {change && (
                    <div className="text-3xl md:text-5xl font-mono mt-4 text-green-400">
                        MONNAIE: <span className="font-bold">{change}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
