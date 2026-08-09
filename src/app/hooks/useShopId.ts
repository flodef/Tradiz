import { useEffect, useState } from 'react';
import { SHOP_ID, fetchShopId } from '../constants/shop';

export interface ShopIdState {
    /** The resolved shop ID, or '' when unknown. */
    shopId: string;
    /** False while the runtime lookup is still in flight. */
    isResolved: boolean;
}

/**
 * Single source of truth for the client-side shop ID.
 *
 * `SHOP_ID` is baked at build time and is empty in CI builds without `.env.local`,
 * so this hook falls back to fetching it from the server at runtime. Always use
 * this hook rather than importing `SHOP_ID` directly, otherwise reads and writes
 * can end up keyed on different shop IDs.
 */
export function useShopId(): ShopIdState {
    const [shopId, setShopId] = useState(SHOP_ID ?? '');
    const [isResolved, setIsResolved] = useState(!!SHOP_ID);

    useEffect(() => {
        if (SHOP_ID) return;

        let cancelled = false;
        fetchShopId().then((id) => {
            if (cancelled) return;
            if (id) setShopId(id);
            setIsResolved(true);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    return { shopId, isResolved };
}
