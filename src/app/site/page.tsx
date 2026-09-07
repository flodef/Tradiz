'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconToolsKitchen2, IconArrowRight, IconMapPin, IconAlertCircle } from '@tabler/icons-react';
import { useTheme, ThemeToggle } from './theme';

/* ───────────────────────────── Types ───────────────────────────── */
interface ShopSummary {
    id: string;
    name: string;
    logo: string;
    image: string;
    address?: string;
    zipCode?: string;
    city?: string;
}

/* ───────────────────────────── Page ───────────────────────────── */
export default function SiteLandingPage() {
    const [shops, setShops] = useState<ShopSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { mode: themeMode, set: setTheme } = useTheme();

    useEffect(() => {
        fetch('/api/public/shops')
            .then((res) => {
                if (!res.ok) throw new Error('Failed to load shops');
                return res.json();
            })
            .then((data: { shops: ShopSummary[] }) => setShops(data.shops))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative flex items-center justify-center h-16">
                        <div
                            className="absolute w-14 h-14 rounded-full bg-orange-200/50 animate-bounce"
                            style={{ animationDuration: '1s' }}
                        />
                        <IconToolsKitchen2
                            size={32}
                            className="text-orange-500 animate-bounce relative z-10"
                            style={{ animationDuration: '1s' }}
                        />
                    </div>
                    <p className="text-site-text-secondary text-lg font-medium">Chargement des magasins…</p>
                </div>
            </div>
        );
    }

    if (error || shops.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text">
                <div className="flex flex-col items-center gap-4">
                    <IconAlertCircle size={48} className="text-site-text-muted" />
                    <p className="text-site-text-secondary text-lg">
                        {error ? 'Impossible de charger les magasins pour le moment.' : 'Aucun magasin disponible.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-site-bg text-site-text transition-colors duration-200">
            <div className="fixed inset-0 -z-10 bg-linear-to-br from-gray-50 via-white to-gray-100 site-dark:from-gray-950 site-dark:via-gray-900 site-dark:to-gray-800" />

            {/* Header */}
            <header className="sticky top-0 z-50 bg-site-nav-bg backdrop-blur-md border-b border-site-border">
                <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm">
                            <IconToolsKitchen2 size={20} className="text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">Tradiz</span>
                    </div>
                    <ThemeToggle mode={themeMode} set={setTheme} />
                </div>
            </header>

            {/* Hero */}
            <section className="max-w-6xl mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-10 text-center">
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
                    Découvrez nos{' '}
                    <span className="bg-linear-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                        magasins
                    </span>
                </h1>
                <p className="mt-4 text-lg md:text-xl text-site-text-secondary max-w-2xl mx-auto">
                    Choisissez une boutique pour parcourir ses produits, ses horaires et la contacter.
                </p>
            </section>

            {/* Shop cards */}
            <section className="max-w-6xl mx-auto px-4 md:px-6 pb-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                    {shops.map((shop) => (
                        <Link
                            key={shop.id}
                            href={`/${shop.id}`}
                            className="group relative flex flex-col rounded-2xl overflow-hidden bg-site-surface border border-site-border shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                        >
                            {/* Cover image / gradient */}
                            <div className="relative h-44 overflow-hidden">
                                {shop.image ? (
                                    <img
                                        src={shop.image}
                                        alt={shop.name}
                                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-linear-to-br from-orange-400 via-amber-500 to-orange-600" />
                                )}
                                <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
                            </div>

                            {/* Logo + name */}
                            <div className="px-6 pb-6 -mt-10 relative">
                                <div className="flex items-end gap-3">
                                    {shop.logo ? (
                                        <img
                                            src={shop.logo}
                                            alt={`${shop.name} logo`}
                                            className="w-16 h-16 rounded-full object-contain bg-white/95 p-1 shadow-md ring-4 ring-site-surface"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md ring-4 ring-site-surface">
                                            <IconToolsKitchen2 size={28} className="text-white" />
                                        </div>
                                    )}
                                </div>
                                <h2 className="mt-4 text-xl font-bold">{shop.name}</h2>
                                {(shop.address || shop.city) && (
                                    <p className="mt-1 text-sm text-site-text-secondary flex items-center gap-1.5">
                                        <IconMapPin size={15} className="shrink-0" />
                                        {shop.address}
                                        {shop.address && (shop.zipCode || shop.city) ? ', ' : ''}
                                        {shop.zipCode} {shop.city}
                                    </p>
                                )}
                                <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 group-hover:gap-2.5 transition-all">
                                    Voir le catalogue
                                    <IconArrowRight size={16} />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-site-footer-bg text-site-footer-text">
                <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <IconToolsKitchen2 size={16} className="text-white" />
                        </div>
                        <span className="font-semibold">Tradiz</span>
                    </div>
                    <p className="text-sm text-site-footer-text/70">
                        &copy; {new Date().getFullYear()} Tradiz. Tous droits réservés.
                    </p>
                </div>
            </footer>
        </div>
    );
}
