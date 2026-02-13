'use client';

import { FC, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { IS_DEV } from '../utils/constants';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { Category } from './Category';
import { NumPad } from './NumPad';
import { Total } from './Total';

export const MainContent: FC = () => {
    const { isStateReady } = useConfig();
    const { setOrderId, setOrderData, addProduct, clearTotal } = useData();

    // Listen for ORDER_ID messages from parent (kitchen iframe)
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== process.env.NEXT_PUBLIC_WEB_URL) return;

            if (event.data && event.data.type === 'ORDER_ID') {
                const orderId = event.data.orderId;
                if (!orderId) return;

                // Clear any existing transaction
                clearTotal();

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

    // Function to handle clicks anywhere on the component to request fullscreen
    const handleClick = () => {
        if (isStateReady && !isFullscreen() && !IS_DEV) requestFullscreen();
    };

    return (
        <div className="z-10 flex flex-col justify-between" onClick={handleClick}>
            <Total />
            <NumPad />
            <Category />
        </div>
    );
};
