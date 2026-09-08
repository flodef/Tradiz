'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from '@/app/utils/localStorage';
import type { ArticleInfo } from '../types';

export interface MyListEntry {
    label: string;
    category: string;
    price: number;
    quantity: number;
}

interface MyListStorage {
    date: string; // YYYY-MM-DD (local time)
    items: MyListEntry[];
}

const MAX_QUANTITY_NULL_STOCK = 999;

function todayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function useMyList(shopId: string, articles: ArticleInfo[]) {
    const [stored, setStored] = useLocalStorage<MyListStorage>(`my-list-${shopId}`, {
        date: todayStr(),
        items: [],
    });

    // Reset list each new day (using local date)
    useEffect(() => {
        if (stored.date !== todayStr()) {
            setStored({ date: todayStr(), items: [] });
        }
    }, [stored.date, setStored]);

    const items = stored.items;

    const getItemQty = useCallback(
        (label: string): number => items.find((i) => i.label === label)?.quantity ?? 0,
        [items]
    );

    const addToList = useCallback(
        (article: ArticleInfo) => {
            setStored((prev) => {
                const currentQty = prev.items.find((i) => i.label === article.label)?.quantity ?? 0;
                const maxQty = article.stock ?? MAX_QUANTITY_NULL_STOCK;
                if (currentQty >= maxQty) return prev;
                if (currentQty === 0) {
                    return {
                        ...prev,
                        items: [
                            ...prev.items,
                            { label: article.label, category: article.category, price: article.price, quantity: 1 },
                        ],
                    };
                }
                return {
                    ...prev,
                    items: prev.items.map((i) => (i.label === article.label ? { ...i, quantity: i.quantity + 1 } : i)),
                };
            });
        },
        [setStored]
    );

    const removeFromList = useCallback(
        (label: string) => {
            setStored((prev) => {
                const currentQty = prev.items.find((i) => i.label === label)?.quantity ?? 0;
                if (currentQty <= 1) {
                    return { ...prev, items: prev.items.filter((i) => i.label !== label) };
                }
                return {
                    ...prev,
                    items: prev.items.map((i) => (i.label === label ? { ...i, quantity: i.quantity - 1 } : i)),
                };
            });
        },
        [setStored]
    );

    const removeItem = useCallback(
        (label: string) => setStored((prev) => ({ ...prev, items: prev.items.filter((i) => i.label !== label) })),
        [setStored]
    );

    const clearList = useCallback(() => setStored((prev) => ({ ...prev, items: [] })), [setStored]);

    const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);
    const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

    // Check for items that became unavailable (stock <= 0 or product no longer exists)
    const stockByLabel = useMemo(() => {
        const map = new Map<string, number | null>();
        for (const a of articles) {
            map.set(a.label, a.stock);
        }
        return map;
    }, [articles]);

    const unavailableItems = useMemo(
        () =>
            items.filter((i) => {
                const stock = stockByLabel.get(i.label);
                // undefined = product removed, null = unlimited stock, number = actual stock
                return stock === undefined || (stock !== null && stock <= 0);
            }),
        [items, stockByLabel]
    );
    const hasStockConflict = unavailableItems.length > 0;

    return {
        items,
        total,
        totalItems,
        getItemQty,
        addToList,
        removeFromList,
        removeItem,
        clearList,
        stockByLabel,
        unavailableItems,
        hasStockConflict,
    };
}
