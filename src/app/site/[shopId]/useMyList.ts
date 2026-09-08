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

export function useMyList(shopName: string, articles: ArticleInfo[]) {
    const [stored, setStored] = useLocalStorage<MyListStorage>(`my-list-${shopName}`, {
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

    const setItems = useCallback(
        (newItems: MyListEntry[]) => setStored({ ...stored, items: newItems }),
        [stored, setStored]
    );

    const getItemQty = useCallback(
        (label: string): number => items.find((i) => i.label === label)?.quantity ?? 0,
        [items]
    );

    const addToList = useCallback(
        (article: ArticleInfo) => {
            const currentQty = items.find((i) => i.label === article.label)?.quantity ?? 0;
            const maxQty = article.stock ?? MAX_QUANTITY_NULL_STOCK;
            if (currentQty >= maxQty) return;
            if (currentQty === 0) {
                setItems([
                    ...items,
                    { label: article.label, category: article.category, price: article.price, quantity: 1 },
                ]);
            } else {
                setItems(items.map((i) => (i.label === article.label ? { ...i, quantity: i.quantity + 1 } : i)));
            }
        },
        [items, setItems]
    );

    const removeFromList = useCallback(
        (label: string) => {
            const currentQty = items.find((i) => i.label === label)?.quantity ?? 0;
            if (currentQty <= 1) {
                setItems(items.filter((i) => i.label !== label));
            } else {
                setItems(items.map((i) => (i.label === label ? { ...i, quantity: i.quantity - 1 } : i)));
            }
        },
        [items, setItems]
    );

    const removeItem = useCallback(
        (label: string) => setItems(items.filter((i) => i.label !== label)),
        [items, setItems]
    );

    const clearList = useCallback(() => setItems([]), [setItems]);

    const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);
    const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

    // Check for items that became unavailable
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
                return stock !== null && stock !== undefined && stock <= 0;
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
