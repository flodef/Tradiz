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
    const { setOrderId, setOrderData, clearTotal } = useData();

    // Listen for ORDER_ID messages from parent (kitchen iframe)
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Security: verify origin if needed
            // if (event.origin !== window.location.origin) return;

            if (event.data && event.data.type === 'ORDER_ID') {
                const orderId = event.data.orderId;

                // Clear any existing transaction
                clearTotal();

                // Load order data to check if partial payment should be available
                try {
                    const response = await fetch(`/api/sql/getOrderItemsForPayment?orderId=${orderId}`);
                    if (response.ok) {
                        const data = await response.json();
                        setOrderData(data);
                    }
                } catch (error) {
                    console.error('Failed to load order data:', error);
                }

                // Set the order ID to trigger partial payment mode
                setOrderId(orderId);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [setOrderId, setOrderData, clearTotal]);

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
