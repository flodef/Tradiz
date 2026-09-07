'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    IconX,
    IconPlus,
    IconMinus,
    IconTrash,
    IconShoppingBag,
    IconPhone,
    IconMail,
    IconCheck,
    IconAlertCircle,
    IconSend,
} from '@tabler/icons-react';
import { useLocalStorage } from '@/app/utils/localStorage';
import { sendReservationEmail } from '@/app/actions/email';

export interface ArticleInfo {
    label: string;
    price: number;
    category: string;
    stock: number | null;
    photo: string;
    description: string;
}

export interface ShopInfo {
    name: string;
    address: string;
    zipCode: string;
    city: string;
    phone: string;
    email: string;
    logo: string;
    image: string;
}

interface MyListEntry {
    label: string;
    category: string;
    price: number;
    quantity: number;
}

interface MyListStorage {
    date: string; // YYYY-MM-DD
    items: MyListEntry[];
}

interface MyListProps {
    open: boolean;
    onClose: () => void;
    articles: ArticleInfo[];
    shop: ShopInfo;
    currencySymbol: string;
    currencyDecimals: number;
    reservationPhone: boolean;
    reservationEmail: boolean;
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function stockColor(stock: number): string {
    if (stock <= 3) return 'text-red-600';
    if (stock <= 7) return 'text-orange-600';
    return 'text-green-600';
}

export default function MyList({
    open,
    onClose,
    articles,
    shop,
    currencySymbol,
    currencyDecimals,
    reservationPhone,
    reservationEmail,
}: MyListProps) {
    const [stored, setStored] = useLocalStorage<MyListStorage>(`my-list-${shop.name}`, {
        date: todayStr(),
        items: [],
    });
    const [reservationStep, setReservationStep] = useState<'list' | 'contact' | 'sent'>('list');
    const [contactInfo, setContactInfo] = useState({ name: '', phone: '' });
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(false);

    // Reset list each new day
    useEffect(() => {
        if (stored.date !== todayStr()) {
            setStored({ date: todayStr(), items: [] });
        }
    }, [stored.date, setStored]);

    // Reset to list view when opening
    useEffect(() => {
        if (open) {
            setReservationStep('list');
            setSendError(false);
        }
    }, [open]);

    // Build a lookup of current article stock by label
    const stockByLabel = useMemo(() => {
        const map = new Map<string, number | null>();
        for (const a of articles) {
            map.set(a.label, a.stock);
        }
        return map;
    }, [articles]);

    // Available articles (stock > 0 or stock === null)
    const availableArticles = useMemo(() => {
        return articles.filter((a) => a.stock === null || a.stock > 0);
    }, [articles]);

    const items = stored.items;
    const setItems = (newItems: MyListEntry[]) => setStored({ ...stored, items: newItems });

    const getItemQty = (label: string): number => items.find((i) => i.label === label)?.quantity ?? 0;

    const addToList = (article: ArticleInfo) => {
        const currentQty = getItemQty(article.label);
        const maxQty = article.stock ?? 999;
        if (currentQty >= maxQty) return;
        if (currentQty === 0) {
            setItems([...items, { label: article.label, category: article.category, price: article.price, quantity: 1 }]);
        } else {
            setItems(
                items.map((i) => (i.label === article.label ? { ...i, quantity: i.quantity + 1 } : i))
            );
        }
    };

    const removeFromList = (label: string) => {
        const currentQty = getItemQty(label);
        if (currentQty <= 1) {
            setItems(items.filter((i) => i.label !== label));
        } else {
            setItems(items.map((i) => (i.label === label ? { ...i, quantity: i.quantity - 1 } : i)));
        }
    };

    const removeItem = (label: string) => setItems(items.filter((i) => i.label !== label));

    const clearList = () => setItems([]);

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

    const formatPrice = (price: number) => `${price.toFixed(currencyDecimals)} ${currencySymbol}`;

    // Check for items that became unavailable
    const unavailableItems = items.filter((i) => {
        const stock = stockByLabel.get(i.label);
        return stock !== null && stock !== undefined && stock <= 0;
    });

    // Group available articles by category
    const categories = useMemo(() => {
        const cats: { name: string; items: ArticleInfo[] }[] = [];
        const catIndex: Record<string, number> = {};
        for (const article of availableArticles) {
            if (catIndex[article.category] === undefined) {
                catIndex[article.category] = cats.length;
                cats.push({ name: article.category, items: [] });
            }
            cats[catIndex[article.category]].items.push(article);
        }
        return cats;
    }, [availableArticles]);

    const handlePhoneReservation = () => {
        // Just close — the user calls the phone number shown
        window.location.href = `tel:${shop.phone.replace(/\s/g, '')}`;
    };

    const handleEmailReservation = async () => {
        if (!contactInfo.name.trim() || !contactInfo.phone.trim()) return;
        setSending(true);
        setSendError(false);
        try {
            const success = await sendReservationEmail(
                shop.email,
                shop.name,
                contactInfo.name,
                contactInfo.phone,
                items.map((i) => ({ label: i.label, category: i.category, price: i.price, quantity: i.quantity })),
                currencySymbol
            );
            if (success) {
                setReservationStep('sent');
            } else {
                setSendError(true);
            }
        } catch {
            setSendError(true);
        } finally {
            setSending(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-site-overlay flex items-center justify-center p-4">
            <div className="bg-site-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-site-border shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
                            <IconShoppingBag size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-site-text">Ma liste</h2>
                            <p className="text-xs text-site-text-muted">{totalItems} article{totalItems > 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover rounded-lg transition-colors cursor-pointer"
                    >
                        <IconX size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    {reservationStep === 'sent' ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                                <IconCheck size={32} className="text-green-600" />
                            </div>
                            <h3 className="text-xl font-bold text-site-text mb-2">Demande envoyée !</h3>
                            <p className="text-site-text-secondary max-w-sm">
                                Votre demande de réservation a été envoyée à {shop.name}. Nous vous contacterons rapidement pour confirmer.
                            </p>
                            <button
                                onClick={() => {
                                    clearList();
                                    onClose();
                                }}
                                className="mt-6 px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors cursor-pointer"
                            >
                                Fermer
                            </button>
                        </div>
                    ) : reservationStep === 'contact' ? (
                        /* Contact form step */
                        <div className="flex flex-col gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-site-text mb-1">Vos coordonnées</h3>
                                <p className="text-sm text-site-text-secondary">
                                    Renseignez vos informations pour que {shop.name} puisse confirmer votre réservation.
                                </p>
                            </div>
                            {/* Summary */}
                            <div className="bg-site-surface-hover rounded-lg p-3 border border-site-border">
                                <p className="text-xs font-semibold text-site-text-muted uppercase mb-2">Récapitulatif</p>
                                {items.map((item) => (
                                    <div key={item.label} className="flex justify-between text-sm py-0.5">
                                        <span className="text-site-text">
                                            {item.quantity}× {item.label}
                                        </span>
                                        <span className="text-site-text-secondary">{formatPrice(item.price * item.quantity)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-site-border">
                                    <span>Total</span>
                                    <span className="text-orange-600">{formatPrice(total)}</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-site-text mb-1 block">Nom + Prénom *</label>
                                <input
                                    type="text"
                                    value={contactInfo.name}
                                    onChange={(e) => setContactInfo({ ...contactInfo, name: e.target.value })}
                                    placeholder="Jean Dupont"
                                    className="w-full px-3 py-2 text-sm rounded-lg bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-site-text mb-1 block">N° de téléphone *</label>
                                <input
                                    type="tel"
                                    value={contactInfo.phone}
                                    onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
                                    placeholder="06 12 34 56 78"
                                    className="w-full px-3 py-2 text-sm rounded-lg bg-site-input-bg border border-site-input-border text-site-text placeholder:text-site-text-muted focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                                />
                            </div>
                            {sendError && (
                                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                                    <IconAlertCircle size={18} />
                                    Une erreur est survenue. Veuillez réessayer.
                                </div>
                            )}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setReservationStep('list')}
                                    className="px-4 py-2.5 rounded-lg font-medium text-site-text bg-site-surface-hover border border-site-border hover:bg-site-border transition-colors cursor-pointer"
                                >
                                    Retour
                                </button>
                                <button
                                    onClick={handleEmailReservation}
                                    disabled={!contactInfo.name.trim() || !contactInfo.phone.trim() || sending}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <IconSend size={18} />
                                    {sending ? 'Envoi…' : 'Valider'}
                                </button>
                            </div>
                        </div>
                    ) : items.length > 0 ? (
                        /* List view with current items */
                        <div className="flex flex-col gap-4">
                            {unavailableItems.length > 0 && (
                                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                                    <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
                                    <span>
                                        {unavailableItems.length} article{unavailableItems.length > 1 ? 's' : ''} ne sont plus disponibles :{' '}
                                        {unavailableItems.map((i) => i.label).join(', ')}
                                    </span>
                                </div>
                            )}
                            {items.map((item) => {
                                const currentStock = stockByLabel.get(item.label);
                                const isUnavailable = currentStock !== null && currentStock !== undefined && currentStock <= 0;
                                return (
                                    <div
                                        key={item.label}
                                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                                            isUnavailable
                                                ? 'border-red-300 bg-red-50/50 dark:bg-red-900/10'
                                                : 'border-site-border bg-site-surface-hover/50'
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-medium text-site-text ${isUnavailable ? 'line-through' : ''}`}>
                                                {item.label}
                                            </p>
                                            <p className="text-xs text-site-text-muted">{item.category}</p>
                                            {currentStock !== null && currentStock !== undefined && currentStock > 0 && (
                                                <p className={`text-xs font-medium ${stockColor(currentStock)}`}>
                                                    {currentStock} restant{currentStock > 1 ? 's' : ''}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => removeFromList(item.label)}
                                                disabled={isUnavailable}
                                                className="w-7 h-7 rounded-full bg-site-surface border border-site-border flex items-center justify-center text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <IconMinus size={14} />
                                            </button>
                                            <span className="w-8 text-center font-semibold text-site-text">{item.quantity}</span>
                                            <button
                                                onClick={() => {
                                                    const article = articles.find((a) => a.label === item.label);
                                                    if (article) addToList(article);
                                                }}
                                                disabled={isUnavailable || (currentStock !== null && item.quantity >= (currentStock ?? 0))}
                                                className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <IconPlus size={14} />
                                            </button>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-site-text text-sm">{formatPrice(item.price * item.quantity)}</p>
                                        </div>
                                        <button
                                            onClick={() => removeItem(item.label)}
                                            className="p-1.5 text-site-text-muted hover:text-red-600 transition-colors cursor-pointer"
                                        >
                                            <IconTrash size={16} />
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Add more products section */}
                            <div className="pt-4 border-t border-site-border">
                                <h3 className="text-sm font-semibold text-site-text mb-3">Ajouter des produits</h3>
                                <div className="flex flex-col gap-4 max-h-60 overflow-y-auto">
                                    {categories.map((cat) => (
                                        <div key={cat.name}>
                                            <p className="text-xs font-semibold text-site-text-muted uppercase mb-2">{cat.name}</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {cat.items.map((article) => {
                                                    const qty = getItemQty(article.label);
                                                    const maxed = article.stock !== null && qty >= (article.stock ?? 0);
                                                    return (
                                                        <button
                                                            key={article.label}
                                                            onClick={() => addToList(article)}
                                                            disabled={maxed}
                                                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-site-border bg-site-surface hover:bg-site-surface-hover transition-colors text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            <span className="text-sm text-site-text truncate">{article.label}</span>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {article.stock !== null && article.stock > 0 && (
                                                                    <span className={`text-xs ${stockColor(article.stock)}`}>
                                                                        {article.stock}
                                                                    </span>
                                                                )}
                                                                {qty > 0 && (
                                                                    <span className="text-xs font-bold text-orange-600">{qty}</span>
                                                                )}
                                                                <IconPlus size={14} className="text-orange-500" />
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 rounded-full bg-site-surface-hover flex items-center justify-center mb-4">
                                <IconShoppingBag size={32} className="text-site-text-muted" />
                            </div>
                            <h3 className="text-lg font-bold text-site-text mb-1">Votre liste est vide</h3>
                            <p className="text-sm text-site-text-secondary mb-6 text-center max-w-sm">
                                Ajoutez des produits disponibles aujourd&apos;hui pour préparer votre réservation.
                            </p>
                            <div className="w-full flex flex-col gap-4 max-h-60 overflow-y-auto">
                                {categories.map((cat) => (
                                    <div key={cat.name}>
                                        <p className="text-xs font-semibold text-site-text-muted uppercase mb-2">{cat.name}</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {cat.items.map((article) => (
                                                <button
                                                    key={article.label}
                                                    onClick={() => addToList(article)}
                                                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-site-border bg-site-surface hover:bg-site-surface-hover transition-colors text-left cursor-pointer"
                                                >
                                                    <span className="text-sm text-site-text truncate">{article.label}</span>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {article.stock !== null && article.stock > 0 && (
                                                            <span className={`text-xs ${stockColor(article.stock)}`}>
                                                                {article.stock}
                                                            </span>
                                                        )}
                                                        <IconPlus size={14} className="text-orange-500" />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer with total + reserve buttons */}
                {reservationStep === 'list' && items.length > 0 && (
                    <div className="border-t border-site-border p-4 md:p-6 shrink-0">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-site-text-secondary">Total</span>
                            <span className="text-xl font-bold text-orange-600">{formatPrice(total)}</span>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={clearList}
                                className="px-4 py-2.5 rounded-lg font-medium text-site-text bg-site-surface-hover border border-site-border hover:bg-site-border transition-colors cursor-pointer"
                            >
                                Vider
                            </button>
                            {reservationPhone && (
                                <button
                                    onClick={handlePhoneReservation}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors cursor-pointer"
                                >
                                    <IconPhone size={18} />
                                    Réserver par téléphone
                                </button>
                            )}
                            {reservationEmail && (
                                <button
                                    onClick={() => setReservationStep('contact')}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors cursor-pointer"
                                >
                                    <IconMail size={18} />
                                    Réserver par email
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
