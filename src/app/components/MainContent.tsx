'use client';

import { FC, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { IS_DEV, NEED_FULLSCREEN } from '../utils/constants';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { Category } from './Category';
import { NumPad } from './NumPad';
import { Total } from './Total';

export const MainContent: FC = () => {
    const { isStateReady } = useConfig();
    const { setOrderId, setOrderData, addProduct, clearTotal, shortNumOrder, orderId } = useData();

    // Listen for ORDER_ID messages from parent (kitchen iframe)
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== process.env.NEXT_PUBLIC_WEB_URL) return;

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

                // Load order items as products
                try {
                    const res = await fetch(`/api/sql/getOrderItems?orderId=${orderId}`);
                    if (res.ok) {
                        const products = await res.json();
                        products.forEach(addProduct);
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
    }, [setOrderId, setOrderData, addProduct, clearTotal]);

    const handleClick = () => {
        if (isStateReady && !isFullscreen() && !IS_DEV && NEED_FULLSCREEN) requestFullscreen();
    };

    return (
        <div className="z-10 flex flex-col justify-between" onClick={handleClick}>
            {orderId && shortNumOrder && (
                <span className="fixed top-3 left-4 hidden md:block text-2xl font-bold opacity-75 select-none pointer-events-none z-50">
                    Commande #{shortNumOrder}
                </span>
            )}
            <Total />
            <NumPad />
            <Category />
        </div>
    );
};
