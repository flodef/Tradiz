'use client';

import { FC, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
// import { IS_DEV } from '../utils/constants';  // Not needed anymore
// import { isFullscreen, requestFullscreen } from '../utils/fullscreen';  // REMOVED: auto-fullscreen disabled
import { Category } from './Category';
import { NumPad } from './NumPad';
import { Total } from './Total';

export const MainContent: FC = () => {
    const { isStateReady } = useConfig();
    const { setOrderId, setOrderData, clearTotal, shortNumOrder, orderId } = useData();

    // Listen for ORDER_ID messages from parent (kitchen iframe)
    // FIXME: Both Category.tsx and MainContent.tsx had their own window.addEventListener('message') for ORDER_ID. Two separate listeners meant:
    // - Race condition — both fire on the same event, with no guaranteed order
    // - Double clearTotal() call
    // - Double setOrderId() call
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Security: verify origin if needed
            // if (event.origin !== window.location.origin) return;

            if (event.data && event.data.type === 'ORDER_ID') {
                console.log('Received ORDER_ID:', event.data.orderId);
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

    // DÉSACTIVÉ : Auto-fullscreen cassait l'affichage dans l'iframe de la kitchen view
    // Le bouton X de fermeture disparaissait car l'iframe passait en fullscreen
    // const handleClick = () => {
    //     if (isStateReady && !isFullscreen() && !IS_DEV) requestFullscreen();
    // };

    return (
        <div className="z-10 flex flex-col justify-between">{/* onClick={handleClick} REMOVED */}
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
