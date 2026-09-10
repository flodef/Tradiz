'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
    IconMapPin,
    IconPhone,
    IconMail,
    IconCheck,
    IconToolsKitchen2,
    IconMenu2,
    IconX,
    IconChevronDown,
    IconSend,
    IconAlertCircle,
    IconSearch,
    IconShoppingBag,
    IconPlus,
    IconMinus,
} from '@tabler/icons-react';
import { sendContactEmail } from '@/app/actions/email';
import MyList from './MyList';
import { useMyList } from './useMyList';
import { useTheme, ThemeToggle } from '../theme';
import Reviews from '../Reviews';
import {
    type ArticleInfo,
    type CatalogData,
    DAY_NAMES,
    jsDayToAdminIndex,
    formatTimeDisplay,
    formatDuration,
    getOpenStatus,
    stockColor,
} from '../types';

export default function SitePage() {
    const [data, setData] = useState<CatalogData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSoldOut, setShowSoldOut] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
    const [contactModalOpen, setContactModalOpen] = useState(false);
    const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
    const [contactSending, setContactSending] = useState(false);
    const [contactSent, setContactSent] = useState(false);
    const [contactError, setContactError] = useState(false);
    const [contactCooldown, setContactCooldown] = useState(0);
    const [honeypot, setHoneypot] = useState('');
    const [mapModalOpen, setMapModalOpen] = useState(false);
    const [hoursModalOpen, setHoursModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [highlightedProduct, setHighlightedProduct] = useState<string | null>(null);
    const [myListOpen, setMyListOpen] = useState(false);
    const { mode: themeMode, set: setTheme } = useTheme();
    const params = useParams<{ shopId: string }>();
    const shopId = params.shopId;
    const myList = useMyList(shopId ?? '', data?.articles ?? []);

    useEffect(() => {
        if (!shopId) return;
        fetch(`/api/public/catalog/${shopId}`)
            .then((res) => {
                if (!res.ok) throw new Error('Failed to load catalog');
                return res.json();
            })
            .then((d: CatalogData) => setData(d))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [shopId]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('site-recent-searches');
            if (stored) setRecentSearches(JSON.parse(stored));
        } catch {
            /* ignore */
        }
    }, []);

    // Cooldown timer for contact form anti-spam
    useEffect(() => {
        if (contactCooldown <= 0) return;
        const timer = setTimeout(() => setContactCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [contactCooldown]);

    // Close mobile menu when clicking outside
    useEffect(() => {
        if (!mobileMenuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const nav = document.querySelector('nav');
            if (nav && !nav.contains(e.target as Node)) {
                setMobileMenuOpen(false);
            }
        };
        // Use a small delay so the click that opened the menu doesn't immediately close it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [mobileMenuOpen]);

    const saveRecentSearch = useCallback((query: string) => {
        const q = query.trim();
        if (!q) return;
        setRecentSearches((prev) => {
            const next = [q, ...prev.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 5);
            localStorage.setItem('site-recent-searches', JSON.stringify(next));
            return next;
        });
    }, []);

    const clearRecentSearches = useCallback(() => {
        setRecentSearches([]);
        localStorage.removeItem('site-recent-searches');
    }, []);

    const allArticles = useMemo(() => {
        if (!data) return [];
        return data.articles;
    }, [data]);

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        return allArticles
            .filter((a) => {
                const inLabel = a.label.toLowerCase().includes(q);
                const inCategory = a.category.toLowerCase().includes(q);
                const inDesc = (a.description ?? '').toLowerCase().includes(q);
                return inLabel || inCategory || inDesc;
            })
            .slice(0, 8);
    }, [searchQuery, allArticles]);

    const scrollToCategory = useCallback((category: string) => {
        const el = document.getElementById(`cat-${category.replace(/\s+/g, '-').toLowerCase()}`);
        if (el) {
            const nav = document.querySelector('nav');
            const navHeight = nav ? nav.getBoundingClientRect().height : 56;
            const banner = document.querySelector('[data-status-banner]');
            const bannerHeight = banner ? banner.getBoundingClientRect().height : 0;
            const y = el.getBoundingClientRect().top + window.scrollY - navHeight - bannerHeight - 8;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }, []);

    const handleSearchSelect = useCallback(
        (article: { label: string; category: string }) => {
            setSearchQuery('');
            setSearchFocused(false);
            saveRecentSearch(article.label);
            const catEl = document.getElementById(`cat-${article.category.replace(/\s+/g, '-').toLowerCase()}`);
            if (catEl) {
                const nav = document.querySelector('nav');
                const navHeight = nav ? nav.getBoundingClientRect().height : 56;
                const banner = document.querySelector('[data-status-banner]');
                const bannerHeight = banner ? banner.getBoundingClientRect().height : 0;
                const y = catEl.getBoundingClientRect().top + window.scrollY - navHeight - bannerHeight - 8;
                window.scrollTo({ top: y, behavior: 'smooth' });
                const productKey = `${article.category.replace(/\s+/g, '-').toLowerCase()}-${article.label.replace(/\s+/g, '-').toLowerCase()}`;
                setHighlightedProduct(productKey);
                setTimeout(() => setHighlightedProduct(null), 2500);
            }
        },
        [saveRecentSearch]
    );

    const handleSearchSubmit = useCallback(
        (query?: string) => {
            const q = (query ?? searchQuery).trim();
            if (!q) return;
            saveRecentSearch(q);
            const match = allArticles.find((a) => a.label.toLowerCase().includes(q.toLowerCase()));
            if (match) {
                handleSearchSelect(match);
            } else {
                const catMatch = allArticles.find((a) => a.category.toLowerCase().includes(q.toLowerCase()));
                if (catMatch) scrollToCategory(catMatch.category);
            }
        },
        [searchQuery, allArticles, saveRecentSearch, handleSearchSelect, scrollToCategory]
    );

    const openingHours = data?.openingHours;
    const shopEmail = data?.shop?.email ?? '';

    const openStatus = useMemo(() => getOpenStatus(openingHours), [openingHours]);

    const handleContactSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!shopEmail) return;
            // Honeypot: bots fill hidden fields, humans don't
            if (honeypot) return;
            // Cooldown: prevent spamming
            if (contactCooldown > 0) return;
            setContactSending(true);
            setContactError(false);
            try {
                const success = await sendContactEmail(
                    shopEmail,
                    contactForm.name,
                    contactForm.email,
                    contactForm.subject,
                    contactForm.message
                );
                if (success) {
                    setContactSent(true);
                    setContactForm({ name: '', email: '', subject: '', message: '' });
                    // Start 60s cooldown
                    setContactCooldown(60);
                } else {
                    setContactError(true);
                }
            } catch {
                setContactError(true);
            } finally {
                setContactSending(false);
            }
        },
        [shopEmail, contactForm, honeypot, contactCooldown]
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text">
                <div className="flex flex-col items-center gap-6">
                    <div
                        className="relative flex items-center justify-center h-16 animate-bounce"
                        style={{ animationDuration: '1s' }}
                    >
                        <div className="absolute w-14 h-14 rounded-full bg-orange-200/50" />
                        <IconToolsKitchen2 size={32} className="text-orange-500 relative z-10" />
                    </div>
                    <p className="text-site-text-secondary text-lg font-medium">Préparation du menu…</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-site-bg text-site-text">
                <p className="text-site-text-secondary text-lg">Impossible de charger le menu pour le moment.</p>
            </div>
        );
    }

    const { shop, currencies, articles } = data;
    const currency = currencies[0] ?? { symbol: '€', decimals: 2, label: 'Euro', maxValue: 999.99, rate: 1, fee: 0 };
    const reservationEnabled = Boolean(data.reservationPhone) || Boolean(data.reservationEmail);

    const formatPrice = (price: number) => {
        const formatted = price.toFixed(currency.decimals);
        return `${formatted} ${currency.symbol}`;
    };

    const mapsUrl = shop.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.address}, ${shop.zipCode} ${shop.city}`)}`
        : '';

    // Group articles by category, preserving order
    const categories: { name: string; items: ArticleInfo[] }[] = [];
    const catIndex: Record<string, number> = {};
    for (const article of articles) {
        if (catIndex[article.category] === undefined) {
            catIndex[article.category] = categories.length;
            categories.push({ name: article.category, items: [] });
        }
        categories[catIndex[article.category]].items.push(article);
    }

    const soldOutCount = articles.filter((a) => a.stock !== null && a.stock <= 0).length;

    const hasOpeningHours = openingHours != null && Object.values(openingHours).some((slots) => slots.length > 0);

    return (
        <div className="min-h-screen bg-site-bg text-site-text transition-colors duration-200">
            <div className="fixed inset-0 -z-10 bg-linear-to-br from-gray-50 via-white to-gray-100 site-dark:from-gray-950 site-dark:via-gray-900 site-dark:to-gray-800" />
            {/* Hero section with shop image */}
            {shop.image && (
                <div className="relative h-[50vh] min-h-75 w-full overflow-hidden">
                    <img src={shop.image} alt={shop.name} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-6 md:p-12">
                        <div className="flex items-center gap-4">
                            {shop.logo && (
                                <img
                                    src={shop.logo}
                                    alt={`${shop.name} logo`}
                                    className="w-16 h-16 md:w-20 md:h-20 rounded-full object-contain bg-white/90 p-1 shadow-lg"
                                />
                            )}
                            <div>
                                <h1 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg">
                                    {shop.name}
                                </h1>
                                {shop.address && (
                                    <button
                                        onClick={() => setMapModalOpen(true)}
                                        title="Cliquez pour voir la carte"
                                        className="text-white/80 text-sm md:text-lg mt-1 drop-shadow hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <IconMapPin size={18} />
                                        {shop.address}, {shop.zipCode} {shop.city}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header (when no shop image) */}
            {!shop.image && (
                <header className="bg-linear-to-r from-orange-500 to-amber-600 text-white py-12 px-3 md:px-6">
                    <div className="max-w-5xl mx-auto flex items-center gap-4">
                        {shop.logo && (
                            <img
                                src={shop.logo}
                                alt={`${shop.name} logo`}
                                className="w-16 h-16 md:w-20 md:h-20 rounded-full object-contain bg-white/90 p-1 shadow-lg"
                            />
                        )}
                        <div>
                            <h1 className="text-3xl md:text-5xl font-bold">{shop.name}</h1>
                            {shop.address && (
                                <button
                                    onClick={() => setMapModalOpen(true)}
                                    title="Cliquez pour voir la carte"
                                    className="text-white/80 text-sm md:text-lg mt-1 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    <IconMapPin size={18} />
                                    {shop.address}, {shop.zipCode} {shop.city}
                                </button>
                            )}
                        </div>
                    </div>
                </header>
            )}

            {/* Navigation menu */}
            <nav className="bg-site-nav-bg/90 backdrop-blur-sm border-b border-site-border sticky top-0 z-20 shadow-sm">
                <div className="max-w-5xl mx-auto px-2">
                    <div className="flex items-center justify-between h-14">
                        {/* Desktop nav */}
                        <div className="hidden md:flex items-center gap-1">
                            {reservationEnabled && (
                                <>
                                    <button
                                        onClick={() => setMyListOpen(true)}
                                        className="px-1 py-2 text-base font-semibold text-orange-600 hover:text-orange-700 transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                        <IconShoppingBag size={18} />
                                        Ma liste
                                        {myList.totalItems > 0 && (
                                            <span className="ml-0.5 bg-orange-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                                                {myList.totalItems}
                                            </span>
                                        )}
                                    </button>
                                    <span
                                        className="h-5 bg-gray-400 dark:bg-gray-500 shrink-0"
                                        style={{ width: '2px' }}
                                    />
                                </>
                            )}
                            {/* Products dropdown */}
                            <div
                                className="relative"
                                onMouseEnter={() => setProductsDropdownOpen(true)}
                                onMouseLeave={() => setProductsDropdownOpen(false)}
                            >
                                <button className="px-1 py-2 text-base font-medium text-site-text hover:text-orange-600 transition-colors flex items-center gap-1 cursor-pointer">
                                    Nos produits
                                    <IconChevronDown
                                        size={16}
                                        className={`transition-transform ${productsDropdownOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                {productsDropdownOpen && (
                                    <div className="absolute top-full left-0 bg-site-surface rounded-lg shadow-lg border border-site-border py-2 min-w-48">
                                        {categories.map((cat) => (
                                            <button
                                                key={cat.name}
                                                onClick={() => {
                                                    setProductsDropdownOpen(false);
                                                    scrollToCategory(cat.name);
                                                }}
                                                className="block w-full text-left px-4 py-2 text-base text-site-text-secondary hover:bg-site-surface-hover hover:text-orange-600 transition-colors cursor-pointer"
                                            >
                                                {cat.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <span className="h-5 bg-gray-400 dark:bg-gray-500 shrink-0" style={{ width: '2px' }} />

                            <button
                                onClick={() => setContactModalOpen(true)}
                                className="px-1 py-2 text-base font-medium text-site-text hover:text-orange-600 transition-colors cursor-pointer"
                            >
                                Nous contacter
                            </button>
                            <span className="h-5 bg-gray-400 dark:bg-gray-500 shrink-0" style={{ width: '2px' }} />
                            {hasOpeningHours && (
                                <>
                                    <button
                                        onClick={() => setHoursModalOpen(true)}
                                        className="px-1 py-2 text-base font-medium text-site-text hover:text-orange-600 transition-colors cursor-pointer"
                                    >
                                        Horaires d&apos;ouverture
                                    </button>
                                    <span
                                        className="h-5 bg-gray-400 dark:bg-gray-500 shrink-0"
                                        style={{ width: '2px' }}
                                    />
                                </>
                            )}
                            <button
                                onClick={() => setMapModalOpen(true)}
                                className="px-1 py-2 text-base font-medium text-site-text hover:text-orange-600 transition-colors cursor-pointer"
                            >
                                Nous trouver
                            </button>
                        </div>

                        {/* Right side: search + open/closed badge + theme toggle */}
                        <div className="hidden md:flex items-center gap-3">
                            {/* Search bar */}
                            <div className="relative">
                                <div className="relative">
                                    <IconSearch
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-site-text-muted pointer-events-none"
                                    />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onFocus={() => setSearchFocused(true)}
                                        onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSearchSubmit();
                                        }}
                                        placeholder="Rechercher…"
                                        className="w-48 pl-9 pr-3 py-1.5 text-sm rounded-full bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all focus:w-64"
                                    />
                                </div>
                                {searchFocused &&
                                    (searchResults.length > 0 || (searchQuery === '' && recentSearches.length > 0)) && (
                                        <div className="absolute top-full right-0 mt-2 bg-site-surface rounded-lg shadow-lg border border-site-border py-2 min-w-72 max-w-96 z-30">
                                            {searchResults.length > 0 && (
                                                <>
                                                    <div className="px-3 py-1 text-xs font-semibold text-site-text-muted uppercase">
                                                        Produits
                                                    </div>
                                                    {searchResults.map((article) => (
                                                        <button
                                                            key={`${article.category}-${article.label}`}
                                                            onMouseDown={() => handleSearchSelect(article)}
                                                            className="block w-full text-left px-4 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer"
                                                        >
                                                            <span className="font-medium">{article.label}</span>
                                                            <span className="text-site-text-muted text-xs ml-2">
                                                                {article.category}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            {searchQuery === '' && recentSearches.length > 0 && (
                                                <>
                                                    <div className="flex items-center justify-between px-3 py-1">
                                                        <span className="text-xs font-semibold text-site-text-muted uppercase">
                                                            Récentes
                                                        </span>
                                                        <button
                                                            onMouseDown={clearRecentSearches}
                                                            className="text-xs text-site-text-muted hover:text-site-text cursor-pointer"
                                                        >
                                                            Effacer
                                                        </button>
                                                    </div>
                                                    {recentSearches.map((s, i) => (
                                                        <button
                                                            key={i}
                                                            onMouseDown={() => handleSearchSubmit(s)}
                                                            className="block w-full text-left px-4 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer"
                                                        >
                                                            <IconSearch
                                                                size={12}
                                                                className="inline mr-2 text-site-text-muted"
                                                            />
                                                            {s}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    )}
                            </div>
                            <ThemeToggle mode={themeMode} set={setTheme} />
                        </div>

                        {/* Mobile: inline search (left) + theme toggle + hamburger (right) */}
                        <div className="flex md:hidden items-center gap-2 ml-auto w-full">
                            <div className="relative flex-1 min-w-0">
                                <IconSearch
                                    size={16}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-site-text-muted pointer-events-none"
                                />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSearchSubmit();
                                    }}
                                    placeholder="Rechercher…"
                                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-full bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                                />
                                {searchFocused &&
                                    (searchResults.length > 0 || (searchQuery === '' && recentSearches.length > 0)) && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-site-surface rounded-lg shadow-lg border border-site-border py-2 z-30 max-h-80 overflow-y-auto">
                                            {searchResults.length > 0 && (
                                                <>
                                                    <div className="px-3 py-1 text-xs font-semibold text-site-text-muted uppercase">
                                                        Produits
                                                    </div>
                                                    {searchResults.map((article) => (
                                                        <button
                                                            key={`${article.category}-${article.label}`}
                                                            onMouseDown={() => handleSearchSelect(article)}
                                                            className="block w-full text-left px-4 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer"
                                                        >
                                                            <span className="font-medium">{article.label}</span>
                                                            <span className="text-site-text-muted text-xs ml-2">
                                                                {article.category}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            {searchQuery === '' && recentSearches.length > 0 && (
                                                <>
                                                    <div className="flex items-center justify-between px-3 py-1">
                                                        <span className="text-xs font-semibold text-site-text-muted uppercase">
                                                            Récentes
                                                        </span>
                                                        <button
                                                            onMouseDown={clearRecentSearches}
                                                            className="text-xs text-site-text-muted hover:text-site-text cursor-pointer"
                                                        >
                                                            Effacer
                                                        </button>
                                                    </div>
                                                    {recentSearches.map((s, i) => (
                                                        <button
                                                            key={i}
                                                            onMouseDown={() => handleSearchSubmit(s)}
                                                            className="block w-full text-left px-4 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer"
                                                        >
                                                            <IconSearch
                                                                size={12}
                                                                className="inline mr-2 text-site-text-muted"
                                                            />
                                                            {s}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    )}
                            </div>
                            <ThemeToggle mode={themeMode} set={setTheme} />
                            <button
                                className="p-2 text-site-text hover:text-orange-600 cursor-pointer shrink-0"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                {mobileMenuOpen ? <IconX size={24} /> : <IconMenu2 size={24} />}
                            </button>
                        </div>
                    </div>

                    {/* Mobile menu */}
                    {mobileMenuOpen && (
                        <div className="md:hidden border-t border-site-border py-3 flex flex-col gap-1">
                            {reservationEnabled && (
                                <button
                                    onClick={() => {
                                        setMyListOpen(true);
                                        setMobileMenuOpen(false);
                                    }}
                                    className="px-4 py-2 text-base font-semibold text-orange-600 hover:text-orange-700 text-left cursor-pointer flex items-center gap-2"
                                >
                                    <IconShoppingBag size={18} />
                                    Ma liste
                                    {myList.totalItems > 0 && (
                                        <span className="ml-0.5 bg-orange-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                                            {myList.totalItems}
                                        </span>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setContactModalOpen(true);
                                    setMobileMenuOpen(false);
                                }}
                                className="px-4 py-2 text-base font-medium text-site-text hover:text-orange-600 text-left cursor-pointer"
                            >
                                Nous contacter
                            </button>
                            {hasOpeningHours && (
                                <button
                                    onClick={() => {
                                        setHoursModalOpen(true);
                                        setMobileMenuOpen(false);
                                    }}
                                    className="px-4 py-2 text-base font-medium text-site-text hover:text-orange-600 text-left cursor-pointer"
                                >
                                    Horaires d&apos;ouverture
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setMapModalOpen(true);
                                    setMobileMenuOpen(false);
                                }}
                                className="px-4 py-2 text-base font-medium text-site-text hover:text-orange-600 text-left cursor-pointer"
                            >
                                Nous trouver
                            </button>
                            <div className="px-4 py-2 text-xs font-semibold text-site-text-muted uppercase">
                                Catégories
                            </div>
                            {categories.map((cat) => (
                                <button
                                    key={cat.name}
                                    onClick={() => {
                                        scrollToCategory(cat.name);
                                        setMobileMenuOpen(false);
                                    }}
                                    className="px-6 py-1.5 text-base text-site-text-secondary hover:text-orange-600 text-left cursor-pointer"
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </nav>

            {/* Open/closed status banner — sticky below nav */}
            {openStatus.status !== 'unknown' && (
                <div
                    className="bg-site-surface border-b border-site-border px-4 py-2 flex items-center justify-center gap-2 sticky top-14 z-10"
                    data-status-banner
                >
                    {hasOpeningHours ? (
                        <button
                            onClick={() => setHoursModalOpen(true)}
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                            <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                    openStatus.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                            >
                                <span
                                    className={`w-2 h-2 rounded-full ${openStatus.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                                />
                                {openStatus.isOpen ? 'Ouvert' : 'Fermé'}
                            </span>
                            {openStatus.nextChange && (
                                <span className="text-xs text-site-text-secondary">
                                    {openStatus.nextType === 'close'
                                        ? openStatus.minutesUntilChange != null && openStatus.minutesUntilChange <= 60
                                            ? `Ferme dans ${formatDuration(openStatus.minutesUntilChange)}`
                                            : `Ferme à ${formatTimeDisplay(openStatus.nextChange)}`
                                        : openStatus.nextDay === 0
                                          ? openStatus.minutesUntilChange != null && openStatus.minutesUntilChange <= 60
                                              ? `Ouvre dans ${formatDuration(openStatus.minutesUntilChange)}`
                                              : `Ouvre aujourd'hui à ${formatTimeDisplay(openStatus.nextChange)}`
                                          : openStatus.nextDay === 1
                                            ? `Ouvre demain à ${formatTimeDisplay(openStatus.nextChange)}`
                                            : `Ouvre ${DAY_NAMES[(jsDayToAdminIndex(new Date().getDay()) + openStatus.nextDay) % 7]} à ${formatTimeDisplay(openStatus.nextChange)}`}
                                </span>
                            )}
                        </button>
                    ) : (
                        <>
                            <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                    openStatus.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                            >
                                <span
                                    className={`w-2 h-2 rounded-full ${openStatus.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                                />
                                {openStatus.isOpen ? 'Ouvert' : 'Fermé'}
                            </span>
                            {openStatus.nextChange && (
                                <span className="text-xs text-site-text-secondary">
                                    {openStatus.nextType === 'close'
                                        ? openStatus.minutesUntilChange != null && openStatus.minutesUntilChange <= 60
                                            ? `Ferme dans ${formatDuration(openStatus.minutesUntilChange)}`
                                            : `Ferme à ${formatTimeDisplay(openStatus.nextChange)}`
                                        : openStatus.nextDay === 0
                                          ? openStatus.minutesUntilChange != null && openStatus.minutesUntilChange <= 60
                                              ? `Ouvre dans ${formatDuration(openStatus.minutesUntilChange)}`
                                              : `Ouvre aujourd'hui à ${formatTimeDisplay(openStatus.nextChange)}`
                                          : openStatus.nextDay === 1
                                            ? `Ouvre demain à ${formatTimeDisplay(openStatus.nextChange)}`
                                            : `Ouvre ${DAY_NAMES[(jsDayToAdminIndex(new Date().getDay()) + openStatus.nextDay) % 7]} à ${formatTimeDisplay(openStatus.nextChange)}`}
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Menu sections */}
            <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
                {/* Sold-out toggle */}
                {soldOutCount > 0 && (
                    <div className="flex items-center justify-end mb-6">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <span className="text-sm text-site-text-secondary">Afficher les articles épuisés</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={showSoldOut}
                                onClick={() => setShowSoldOut(!showSoldOut)}
                                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${showSoldOut ? 'bg-orange-500' : 'bg-gray-300'}`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform cursor-pointer ${showSoldOut ? 'translate-x-5' : ''}`}
                                />
                            </button>
                        </label>
                    </div>
                )}

                {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-site-text-muted">
                        <IconToolsKitchen2 size={48} className="mb-4" />
                        <p className="text-lg">Aucun produit disponible pour le moment.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-12">
                        {categories.map((cat) => {
                            const visibleItems = cat.items
                                .filter((item) => {
                                    const soldOut = item.stock != null && item.stock <= 0;
                                    return showSoldOut || !soldOut;
                                })
                                .sort((a, b) => {
                                    const aSoldOut = a.stock !== null && a.stock <= 0;
                                    const bSoldOut = b.stock !== null && b.stock <= 0;
                                    if (aSoldOut && !bSoldOut) return 1;
                                    if (!aSoldOut && bSoldOut) return -1;
                                    return 0;
                                });
                            if (visibleItems.length === 0) return null;
                            return (
                                <section key={cat.name} id={`cat-${cat.name.replace(/\s+/g, '-').toLowerCase()}`}>
                                    <h2 className="text-2xl md:text-3xl font-bold text-site-text mb-6 flex items-center gap-3">
                                        <span className="w-1 h-8 bg-orange-500 rounded-full" />
                                        {cat.name}
                                    </h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                        {visibleItems.map((item) => {
                                            const soldOut = item.stock != null && item.stock <= 0;
                                            const productKey = `${cat.name.replace(/\s+/g, '-').toLowerCase()}-${item.label.replace(/\s+/g, '-').toLowerCase()}`;
                                            const isHighlighted = highlightedProduct === productKey;
                                            return (
                                                <div
                                                    key={item.label}
                                                    className={`bg-site-surface rounded-2xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${
                                                        soldOut
                                                            ? 'opacity-60 border-red-300 site-dark:border-red-900/50'
                                                            : 'border-site-border'
                                                    } ${isHighlighted ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-site-bg' : ''}`}
                                                >
                                                    {item.photo && (
                                                        <div className="relative h-40 w-full overflow-hidden">
                                                            <img
                                                                src={item.photo}
                                                                alt={item.label}
                                                                className={`h-full w-full object-cover transition-all ${soldOut ? 'grayscale' : ''}`}
                                                            />
                                                            {soldOut && (
                                                                <div className="absolute inset-0 bg-black/30" />
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="p-4">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <h3
                                                                className={`font-semibold text-site-text text-lg leading-tight ${soldOut ? 'line-through' : ''}`}
                                                            >
                                                                {item.label}
                                                            </h3>
                                                            {item.price > 0 && (
                                                                <span
                                                                    className={`font-bold whitespace-nowrap ${soldOut ? 'text-site-text-muted' : 'text-orange-600'}`}
                                                                >
                                                                    {formatPrice(item.price)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.description && (
                                                            <p className="text-sm text-site-text-secondary mt-1.5 line-clamp-2">
                                                                {item.description}
                                                            </p>
                                                        )}
                                                        {item.stock != null && item.stock > 0 && (
                                                            <div className="mt-3 flex items-center gap-2">
                                                                <span
                                                                    className={`inline-flex items-center gap-1 text-xs font-medium ${stockColor(item.stock)}`}
                                                                >
                                                                    {item.stock} restant{item.stock > 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {reservationEnabled &&
                                                            !soldOut &&
                                                            (() => {
                                                                const qty = myList.getItemQty(item.label);
                                                                const maxed = item.stock != null && qty >= item.stock;
                                                                return (
                                                                    <div className="mt-3 flex items-center justify-end gap-2">
                                                                        {qty > 0 ? (
                                                                            <>
                                                                                <button
                                                                                    onClick={() =>
                                                                                        myList.removeFromList(
                                                                                            item.label
                                                                                        )
                                                                                    }
                                                                                    className="w-8 h-8 rounded-full bg-site-surface border border-site-border flex items-center justify-center text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer"
                                                                                >
                                                                                    <IconMinus size={16} />
                                                                                </button>
                                                                                <span className="w-8 text-center font-bold text-site-text tabular-nums">
                                                                                    {qty}
                                                                                </span>
                                                                                <button
                                                                                    onClick={() =>
                                                                                        myList.addToList(item)
                                                                                    }
                                                                                    disabled={maxed}
                                                                                    className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                                                >
                                                                                    <IconPlus size={16} />
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => myList.addToList(item)}
                                                                                disabled={maxed}
                                                                                className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                                                title="Ajouter à ma liste"
                                                                            >
                                                                                <IconShoppingBag size={18} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Reviews */}
            <Reviews shopId={shopId} googlePlaceId={data?.shop?.googlePlaceId} />

            {/* Footer */}
            <footer className="bg-site-footer-bg text-site-footer-text py-8 px-6">
                <div className="max-w-5xl mx-auto text-center">
                    {shop.logo && (
                        <img
                            src={shop.logo}
                            alt={shop.name}
                            className="w-12 h-12 rounded-full object-contain mx-auto mb-3 bg-white/10 p-1"
                        />
                    )}
                    <p className="font-semibold text-site-footer-text">{shop.name}</p>
                    {shop.address && (
                        <button
                            onClick={() => setMapModalOpen(true)}
                            className="text-sm text-site-footer-text/70 mt-1 hover:text-site-footer-text transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
                        >
                            <IconMapPin size={14} />
                            {shop.address}, {shop.zipCode} {shop.city}
                        </button>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-sm">
                        {shop.phone && (
                            <a
                                href={`tel:${shop.phone}`}
                                className="hover:text-site-footer-text transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <IconPhone size={14} />
                                {shop.phone}
                            </a>
                        )}
                        {shop.email && (
                            <a
                                href={`mailto:${shop.email}`}
                                className="hover:text-site-footer-text transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <IconMail size={14} />
                                {shop.email}
                            </a>
                        )}
                    </div>
                    <p className="text-xs text-site-footer-text/50 mt-6">
                        © {new Date().getFullYear()} {shop.name}. Tous droits réservés.
                    </p>
                </div>
            </footer>

            {/* Contact form modal */}
            {contactModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-site-overlay p-4"
                    onClick={() => setContactModalOpen(false)}
                >
                    <div
                        className="bg-site-surface rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-site-text">Nous contacter</h3>
                            <button
                                onClick={() => {
                                    setContactModalOpen(false);
                                    setContactSent(false);
                                    setContactError(false);
                                }}
                                className="text-site-text-muted hover:text-site-text cursor-pointer"
                            >
                                <IconX size={24} />
                            </button>
                        </div>

                        {contactSent ? (
                            <div className="flex flex-col items-center gap-3 py-8">
                                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                                    <IconCheck size={32} className="text-green-600" />
                                </div>
                                <p className="text-lg font-medium text-site-text">Message envoyé !</p>
                                <p className="text-sm text-site-text-secondary text-center">
                                    Nous vous répondrons dans les meilleurs délais.
                                </p>
                                <button
                                    onClick={() => {
                                        setContactModalOpen(false);
                                        setContactSent(false);
                                    }}
                                    className="mt-2 px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors cursor-pointer"
                                >
                                    Fermer
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleContactSubmit} className="flex flex-col gap-4">
                                {/* Honeypot: hidden field to catch bots */}
                                <input
                                    type="text"
                                    name="company"
                                    tabIndex={-1}
                                    autoComplete="off"
                                    value={honeypot}
                                    onChange={(e) => setHoneypot(e.target.value)}
                                    className="absolute opacity-0 pointer-events-none -z-10"
                                    aria-hidden="true"
                                />
                                {contactError && (
                                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 site-dark:bg-red-950/50 site-dark:text-red-400 rounded-lg text-sm">
                                        <IconAlertCircle size={18} />
                                        Erreur lors de l&apos;envoi. Veuillez réessayer.
                                    </div>
                                )}
                                <div>
                                    <label className="text-sm font-medium text-site-text mb-1 block">Nom</label>
                                    <input
                                        type="text"
                                        required
                                        value={contactForm.name}
                                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-site-input-border bg-site-input-bg text-site-text focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                                        placeholder="Votre nom"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-site-text mb-1 block">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={contactForm.email}
                                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-site-input-border bg-site-input-bg text-site-text focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                                        placeholder="votre@email.com"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-site-text mb-1 block">Sujet</label>
                                    <input
                                        type="text"
                                        required
                                        value={contactForm.subject}
                                        onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-site-input-border bg-site-input-bg text-site-text focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm"
                                        placeholder="Sujet de votre message"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-site-text mb-1 block">Message</label>
                                    <textarea
                                        required
                                        rows={4}
                                        value={contactForm.message}
                                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-site-input-border bg-site-input-bg text-site-text focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm resize-none"
                                        placeholder="Votre message…"
                                    />
                                </div>

                                {/* Direct contact links */}
                                <div className="flex items-center justify-between gap-3 pt-2 border-t border-site-border">
                                    {shop.phone && (
                                        <a
                                            href={`tel:${shop.phone}`}
                                            className="flex items-center gap-1.5 text-sm text-site-text-secondary hover:text-orange-600 transition-colors cursor-pointer"
                                        >
                                            <IconPhone size={16} />
                                            {shop.phone}
                                        </a>
                                    )}
                                    {shop.email && (
                                        <a
                                            href={`mailto:${shop.email}`}
                                            className="flex items-center gap-1.5 text-sm text-site-text-secondary hover:text-orange-600 transition-colors cursor-pointer"
                                        >
                                            <IconMail size={16} />
                                            {shop.email}
                                        </a>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={contactSending || contactCooldown > 0}
                                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {contactSending ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Envoi en cours…
                                        </>
                                    ) : contactCooldown > 0 ? (
                                        <>
                                            <IconSend size={18} />
                                            Réessayer dans {contactCooldown}s
                                        </>
                                    ) : (
                                        <>
                                            <IconSend size={18} />
                                            Envoyer
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Map modal */}
            {mapModalOpen && mapsUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-site-overlay p-4"
                    onClick={() => setMapModalOpen(false)}
                >
                    <div
                        className="bg-site-surface rounded-2xl shadow-xl max-w-2xl w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-site-text flex items-center gap-2">
                                <IconMapPin size={22} className="text-orange-500" />
                                {shop.name}
                            </h3>
                            <button
                                onClick={() => setMapModalOpen(false)}
                                className="text-site-text-muted hover:text-site-text cursor-pointer"
                            >
                                <IconX size={24} />
                            </button>
                        </div>
                        <p className="text-sm text-site-text-secondary mb-4">
                            {shop.address}, {shop.zipCode} {shop.city}
                        </p>
                        <div className="rounded-xl overflow-hidden border border-site-border">
                            <iframe
                                title="Carte"
                                width="100%"
                                height="400"
                                style={{ border: 0 }}
                                loading="lazy"
                                src={`https://maps.google.com/maps?q=${encodeURIComponent(`${shop.address}, ${shop.zipCode} ${shop.city}`)}&output=embed`}
                            />
                        </div>
                        <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors cursor-pointer"
                        >
                            <IconMapPin size={18} />
                            Ouvrir dans Google Maps
                        </a>
                    </div>
                </div>
            )}

            {/* Opening hours modal */}
            {hoursModalOpen && hasOpeningHours && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-site-overlay p-4"
                    onClick={() => setHoursModalOpen(false)}
                >
                    <div
                        className="bg-site-surface rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-site-text flex items-center gap-2">
                                <span className="w-1 h-6 bg-orange-500 rounded-full" />
                                Horaires d&apos;ouverture
                            </h3>
                            <button
                                onClick={() => setHoursModalOpen(false)}
                                className="text-site-text-muted hover:text-site-text cursor-pointer"
                            >
                                <IconX size={24} />
                            </button>
                        </div>
                        <div className="flex flex-col gap-1">
                            {DAY_NAMES.map((dayName, dayIndex) => {
                                const slots = openingHours[dayIndex] ?? [];
                                const isToday = jsDayToAdminIndex(new Date().getDay()) === dayIndex;
                                return (
                                    <div
                                        key={dayIndex}
                                        className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                                            isToday ? 'bg-orange-50 site-dark:bg-orange-950/30' : ''
                                        }`}
                                    >
                                        <span
                                            className={`text-sm font-medium ${isToday ? 'text-orange-600' : 'text-site-text'}`}
                                        >
                                            {dayName}
                                            {isToday && <span className="text-xs ml-1">(aujourd&apos;hui)</span>}
                                        </span>
                                        <div className="flex flex-col items-end gap-0.5">
                                            {slots.length === 0 ? (
                                                <span className="text-sm text-site-text-muted">Fermé</span>
                                            ) : (
                                                slots.map((slot, i) => (
                                                    <span
                                                        key={i}
                                                        className="text-sm text-site-text-secondary tabular-nums"
                                                    >
                                                        {formatTimeDisplay(slot.open)} - {formatTimeDisplay(slot.close)}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {reservationEnabled && (
                <MyList
                    open={myListOpen}
                    onClose={() => setMyListOpen(false)}
                    items={myList.items}
                    onAdd={myList.addToList}
                    onRemove={myList.removeFromList}
                    onRemoveItem={myList.removeItem}
                    onClear={myList.clearList}
                    articles={articles}
                    shop={shop}
                    currencySymbol={currency.symbol}
                    currencyDecimals={currency.decimals}
                    reservationPhone={data.reservationPhone ?? false}
                    reservationEmail={data.reservationEmail ?? false}
                    stockByLabel={myList.stockByLabel}
                    unavailableItems={myList.unavailableItems}
                    hasStockConflict={myList.hasStockConflict}
                    total={myList.total}
                    totalItems={myList.totalItems}
                />
            )}
        </div>
    );
}
