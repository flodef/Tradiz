'use client';

import { useState, useEffect } from 'react';
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
import { type ArticleInfo, type ShopInfo, stockColor } from '../types';
import { sendReservationEmail } from '@/app/actions/email';
import type { MyListEntry } from './useMyList';

const FRENCH_PHONE_REGEX = /^(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;

interface MyListProps {
    open: boolean;
    onClose: () => void;
    items: MyListEntry[];
    onAdd: (article: ArticleInfo) => void;
    onRemove: (label: string) => void;
    onRemoveItem: (label: string) => void;
    onClear: () => void;
    getItemQty: (label: string) => number;
    articles: ArticleInfo[];
    shop: ShopInfo;
    currencySymbol: string;
    currencyDecimals: number;
    reservationPhone: boolean;
    reservationEmail: boolean;
    stockByLabel: Map<string, number | null>;
    unavailableItems: MyListEntry[];
    hasStockConflict: boolean;
    total: number;
    totalItems: number;
}

export default function MyList({
    open,
    onClose,
    items,
    onAdd,
    onRemove,
    onRemoveItem,
    onClear,
    articles,
    shop,
    currencySymbol,
    currencyDecimals,
    reservationPhone,
    reservationEmail,
    stockByLabel,
    unavailableItems,
    hasStockConflict,
    total,
    totalItems,
}: MyListProps) {
    const [reservationStep, setReservationStep] = useState<'list' | 'contact' | 'sent'>('list');
    const [contactInfo, setContactInfo] = useState({ name: '', phone: '' });
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(false);

    // Reset to list view when opening
    useEffect(() => {
        if (open) {
            setReservationStep('list');
            setSendError(false);
        }
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && reservationStep === 'list') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, reservationStep, onClose]);

    const formatPrice = (price: number) => `${price.toFixed(currencyDecimals)} ${currencySymbol}`;

    const handlePhoneReservation = () => {
        const link = document.createElement('a');
        link.href = `tel:${shop.phone.replace(/\s/g, '')}`;
        link.click();
    };

    const isPhoneValid = FRENCH_PHONE_REGEX.test(contactInfo.phone.trim());

    const handleEmailReservation = async () => {
        if (!contactInfo.name.trim() || !isPhoneValid) return;
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
        <div
            className="fixed inset-0 z-50 bg-site-overlay flex items-center justify-center p-4"
            onClick={() => {
                if (reservationStep === 'list') onClose();
            }}
        >
            <div
                className="bg-site-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-site-border shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
                            <IconShoppingBag size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-site-text">Ma liste</h2>
                            <p className="text-xs text-site-text-muted">
                                {totalItems} article{totalItems > 1 ? 's' : ''}
                            </p>
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
                                Votre demande de réservation a été envoyée à {shop.name}. Nous vous contacterons
                                rapidement pour confirmer.
                            </p>
                            <button
                                onClick={() => {
                                    onClear();
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
                                <p className="text-xs font-semibold text-site-text-muted uppercase mb-2">
                                    Récapitulatif
                                </p>
                                {items.map((item) => (
                                    <div key={item.label} className="flex justify-between text-sm py-0.5">
                                        <span className="text-site-text">
                                            {item.quantity}× {item.label}
                                        </span>
                                        <span className="text-site-text-secondary">
                                            {formatPrice(item.price * item.quantity)}
                                        </span>
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
                                <label className="text-sm font-medium text-site-text mb-1 block">
                                    N° de téléphone *
                                </label>
                                <input
                                    type="tel"
                                    value={contactInfo.phone}
                                    onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
                                    placeholder="06 12 34 56 78"
                                    className={`w-full px-3 py-2 text-sm rounded-lg bg-site-input-bg border text-site-text placeholder:text-site-text-muted focus:ring-2 focus:ring-orange-500 outline-none ${
                                        contactInfo.phone && !isPhoneValid
                                            ? 'border-red-500 focus:border-red-500'
                                            : 'border-site-input-border focus:border-orange-500'
                                    }`}
                                />
                                {contactInfo.phone && !isPhoneValid && (
                                    <p className="text-xs text-red-500 mt-1">
                                        Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78
                                    </p>
                                )}
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
                                    disabled={!contactInfo.name.trim() || !isPhoneValid || sending}
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
                            {hasStockConflict && (
                                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                                    <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
                                    <span>
                                        {unavailableItems.length} article{unavailableItems.length > 1 ? 's' : ''} ne
                                        sont plus disponibles : {unavailableItems.map((i) => i.label).join(', ')}.
                                        Retirez-le{unavailableItems.length > 1 ? 's' : ''} pour continuer.
                                    </span>
                                </div>
                            )}
                            {items.map((item) => {
                                const currentStock = stockByLabel.get(item.label);
                                const isUnavailable =
                                    currentStock !== null && currentStock !== undefined && currentStock <= 0;
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
                                            <p
                                                className={`font-medium text-site-text ${isUnavailable ? 'line-through' : ''}`}
                                            >
                                                {item.label}
                                            </p>
                                            <p className="text-xs text-site-text-muted">{item.category}</p>
                                            {currentStock !== null &&
                                                currentStock !== undefined &&
                                                currentStock > 0 && (
                                                    <p className={`text-xs font-medium ${stockColor(currentStock)}`}>
                                                        {currentStock} restant{currentStock > 1 ? 's' : ''}
                                                    </p>
                                                )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onRemove(item.label)}
                                                disabled={isUnavailable}
                                                className="w-7 h-7 rounded-full bg-site-surface border border-site-border flex items-center justify-center text-site-text hover:bg-site-surface-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <IconMinus size={14} />
                                            </button>
                                            <span className="w-8 text-center font-semibold text-site-text">
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const article = articles.find((a) => a.label === item.label);
                                                    if (article) onAdd(article);
                                                }}
                                                disabled={
                                                    isUnavailable ||
                                                    (currentStock !== null && item.quantity >= (currentStock ?? 0))
                                                }
                                                className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <IconPlus size={14} />
                                            </button>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-bold text-site-text text-sm">
                                                {formatPrice(item.price * item.quantity)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onRemoveItem(item.label)}
                                            className="p-2 text-site-text-muted hover:text-red-600 transition-colors cursor-pointer"
                                        >
                                            <IconTrash size={22} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 rounded-full bg-site-surface-hover flex items-center justify-center mb-4">
                                <IconShoppingBag size={32} className="text-site-text-muted" />
                            </div>
                            <h3 className="text-lg font-bold text-site-text mb-1">Votre liste est vide</h3>
                            <p className="text-sm text-site-text-secondary text-center max-w-sm">
                                Ajoutez des produits depuis le catalogue pour préparer votre réservation.
                            </p>
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
                                onClick={onClear}
                                className="px-4 py-2.5 rounded-lg font-medium text-site-text bg-site-surface-hover border border-site-border hover:bg-site-border transition-colors cursor-pointer"
                            >
                                Vider
                            </button>
                            {reservationPhone && (
                                <button
                                    onClick={handlePhoneReservation}
                                    disabled={hasStockConflict}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <IconPhone size={18} />
                                    Réserver par téléphone
                                </button>
                            )}
                            {reservationEmail && (
                                <button
                                    onClick={() => setReservationStep('contact')}
                                    disabled={hasStockConflict}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={
                                        hasStockConflict
                                            ? 'Retirez les articles indisponibles pour réserver'
                                            : undefined
                                    }
                                >
                                    <IconMail size={18} />
                                    Réserver par email
                                </button>
                            )}
                        </div>
                        {hasStockConflict && (
                            <p className="text-xs text-red-500 mt-2 text-center">
                                Retirez les articles indisponibles pour pouvoir réserver.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
