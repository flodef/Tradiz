'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { OrderData, OrderItem } from '../utils/interfaces';
import { usePay } from '../hooks/usePay';

interface OrderItemsSelectorProps {
    orderId: string;
    onSelectionChange: (selectedItems: OrderItem[], totalAmount: number) => void;
}

// Helper function to format options JSON
const formatOptions = (optionsStr?: string): string => {
    if (!optionsStr) return '';

    try {
        const options = JSON.parse(optionsStr);
        if (Array.isArray(options)) {
            return options.map((opt) => `${opt.type}: ${opt.valeur}`).join(', ');
        }
        return optionsStr;
    } catch {
        return optionsStr;
    }
};

export const OrderItemsSelector: FC<OrderItemsSelectorProps> = ({ orderId, onSelectionChange }) => {
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const { pay } = usePay();

    // Keep ref updated
    useEffect(() => {
        onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);

    // Load order data
    useEffect(() => {
        if (!orderId || orderId === 'undefined') return;

        const loadOrderData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/sql/getOrderItemsForPayment?orderId=${orderId}`);

                if (!response.ok) {
                    throw new Error('Failed to load order data');
                }

                const data: OrderData = await response.json();
                setOrderData(data);

                // Don't auto-select any items (user will select manually)
                setSelectedItemIds(new Set());
            } catch (err) {
                console.error('Error loading order:', err);
                setError('Erreur lors du chargement de la commande');
            } finally {
                setLoading(false);
            }
        };

        loadOrderData();
    }, [orderId]);

    // Notify parent when selection changes (separate effect)
    useEffect(() => {
        if (!orderData) return;

        const selectedItems = orderData.items.filter((item) => selectedItemIds.has(item.id));
        const total = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        onSelectionChangeRef.current(selectedItems, total);
    }, [selectedItemIds, orderData]);

    const toggleItem = useCallback(
        (itemId: string) => {
            if (!orderData) return;

            // Don't allow toggling already paid items
            const item = orderData.items.find((i) => i.id === itemId);
            if (item?.paid_at) return;

            setSelectedItemIds((prev) => {
                const newSet = new Set(prev);
                if (newSet.has(itemId)) {
                    newSet.delete(itemId);
                } else {
                    newSet.add(itemId);
                }

                // Notify parent of change
                // FIXME: There was a useEffect watching selectedItemIds that also called onSelectionChange, so every toggle triggered the callback twice — once from inside the state updater and once from the effect
                const selectedItems = orderData.items.filter((item) => newSet.has(item.id));
                const total = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
                onSelectionChange(selectedItems, total);

                return newSet;
            });
        },
        [orderData, onSelectionChange]
    );

    const formatPrice = (price: number) => {
        return price.toFixed(2) + '€';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-xl">Chargement de la commande...</div>
            </div>
        );
    }

    if (error || !orderData) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-xl text-red-500">{error || 'Commande introuvable'}</div>
            </div>
        );
    }

    const selectedTotal = orderData.items
        .filter((item) => selectedItemIds.has(item.id))
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <div className="flex flex-col h-full max-h-[70vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gray-100 dark:bg-gray-800 p-4 border-b border-gray-300 dark:border-gray-600">
                <h2 className="text-2xl font-bold">Commande #{orderData.short_num_order}</h2>
                <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                        <span>Total commande:</span>
                        <span className="font-semibold">{formatPrice(orderData.total_amount)}</span>
                    </div>
                    {orderData.paid_amount > 0 && (
                        <div className="flex justify-between text-green-600 dark:text-green-400">
                            <span>Déjà payé:</span>
                            <span className="font-semibold">{formatPrice(orderData.paid_amount)}</span>
                        </div>
                    )}
                    {orderData.remaining_amount > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                            <span>Reste à payer:</span>
                            <span className="font-semibold">{formatPrice(orderData.remaining_amount)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {orderData.items.map((item) => {
                    const isSelected = selectedItemIds.has(item.id);
                    const isPaid = !!item.paid_at;
                    const itemTotal = item.price * item.quantity;

                    return (
                        <div
                            key={item.id}
                            onClick={() => !isPaid && toggleItem(item.id)}
                            className={twMerge(
                                'p-4 rounded-lg border-2 transition-all',
                                isPaid
                                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 opacity-60 cursor-not-allowed'
                                    : isSelected
                                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40'
                                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        {/* Checkbox */}
                                        <div
                                            className={twMerge(
                                                'w-6 h-6 rounded border-2 flex items-center justify-center transition-colors',
                                                isPaid
                                                    ? 'bg-green-500 border-green-500'
                                                    : isSelected
                                                      ? 'bg-blue-500 border-blue-500'
                                                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-500'
                                            )}
                                        >
                                            {(isSelected || isPaid) && (
                                                <svg
                                                    className="w-4 h-4 text-white"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={3}
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                            )}
                                        </div>

                                        {/* Item type badge */}
                                        <span
                                            className={twMerge(
                                                'px-2 py-1 text-xs font-semibold rounded',
                                                item.type === 'formule'
                                                    ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                                            )}
                                        >
                                            {item.type === 'formule' ? 'Formule' : 'Article'}
                                        </span>

                                        {/* Label */}
                                        <span className="font-semibold text-lg">{item.label}</span>
                                    </div>

                                    {/* Formule elements */}
                                    {item.type === 'formule' && item.elements && (
                                        <div className="mt-2 ml-8 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                            {item.elements.map((el, idx) => (
                                                <div key={idx}>
                                                    • {el.category}: <span className="font-medium">{el.choice}</span>
                                                    {el.options && (
                                                        <span className="text-xs ml-2">
                                                            ({formatOptions(el.options)})
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                            {item.note && <div className="italic mt-1">Note: {item.note}</div>}
                                        </div>
                                    )}

                                    {/* Article options */}
                                    {item.type === 'article' && item.options && (
                                        <div className="mt-1 ml-8 text-sm text-gray-600 dark:text-gray-400">
                                            {formatOptions(item.options)}
                                        </div>
                                    )}

                                    {/* Paid status */}
                                    {isPaid && (
                                        <div className="mt-2 ml-8 text-sm text-green-600 dark:text-green-400 font-medium">
                                            ✓ Payé le {new Date(item.paid_at!).toLocaleString('fr-FR')}
                                        </div>
                                    )}
                                </div>

                                {/* Price */}
                                <div className="text-right ml-4">
                                    <div className="text-lg font-bold">{formatPrice(itemTotal)}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                        {item.quantity > 1 && `${item.quantity} × ${formatPrice(item.price)}`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {orderData.items.length === 0 && (
                    <div className="text-center py-8 text-gray-500">Aucun article dans cette commande</div>
                )}
            </div>

            {/* Footer - Selected total */}
            <div className="bg-gray-100 dark:bg-gray-800 p-4 border-t border-gray-300 dark:border-gray-600">
                <div className="flex justify-between items-center text-xl font-bold mb-3">
                    <span>Montant sélectionné:</span>
                    <span className={twMerge('text-2xl', selectedTotal > 0 ? 'text-blue-600 dark:text-blue-400' : '')}>
                        {formatPrice(selectedTotal)}
                    </span>
                </div>
                {selectedTotal === 0 && orderData.remaining_amount > 0 && (
                    <div className="text-center text-sm text-orange-600 dark:text-orange-400 mb-2">
                        Sélectionnez au moins un article à payer
                    </div>
                )}
                <button
                    onClick={pay}
                    disabled={selectedTotal === 0}
                    className={twMerge(
                        'w-full py-3 px-4 rounded-lg font-bold text-xl transition-all',
                        selectedTotal > 0
                            ? 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                            : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    )}
                >
                    PAYER {selectedTotal > 0 && formatPrice(selectedTotal)}
                </button>
            </div>
        </div>
    );
};
