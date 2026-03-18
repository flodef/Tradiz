'use client';

import { FC, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { IS_DEV, USE_DIGICARTE, WEB_URL } from '../utils/constants';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { Category } from './Category';
import { NumPad } from './NumPad';
import { OrderBadge } from './OrderBadge';
import { Total } from './Total';

export const MainContent: FC = () => {
    const { isStateReady } = useConfig();
    const { setOrderId, setOrderData, addProduct, clearTotal, shortNumOrder, setShortNumOrder, orderId } = useData();

    // Listen for ORDER_ID messages from parent (kitchen iframe)
    useEffect(() => {
        if (!USE_DIGICARTE) return;

        const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== WEB_URL) return;

            if (event.data && event.data.type === 'ORDER_ID') {
                const orderId = event.data.orderId;
                if (!orderId) return;

                // Always clear any existing transaction on caisse open
                clearTotal();

                // No order context — stop here (don't call API with undefined orderId)
                if (!orderId || orderId === 'undefined') return;

                // Load order data for partial payment
                try {
                    const response = await fetch(`/api/sql/getOrderItemsForPayment?orderId=${orderId}`);
                    if (response.ok) {
                        const data = await response.json();
                        setOrderData(data);
                    }
                } catch (error) {
                    console.error('Failed to load order data:', error);
                }

                // Load order items as products (+ shortNumOrder)
                try {
                    const res = await fetch(`/api/sql/getOrderItems?orderId=${orderId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.shortNumOrder) setShortNumOrder(data.shortNumOrder);
                        (data.products || []).forEach(addProduct);
                    }
                } catch (error) {
                    console.error('Failed to load order items:', error);
                }

                // Set the order ID (after data is loaded to avoid race conditions)
                setOrderId(orderId);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [setOrderId, setOrderData, setShortNumOrder, addProduct, clearTotal]);

    const handleClick = () => {
        if (isStateReady && !isFullscreen() && !IS_DEV && !USE_DIGICARTE) requestFullscreen();
    };

    return (
        <div className="z-10 flex flex-col justify-between" onClick={handleClick}>
            <OrderBadge orderId={orderId} shortNumOrder={shortNumOrder} />
            <Total />
            <NumPad />
            <Category />
        </div>
    );
};
