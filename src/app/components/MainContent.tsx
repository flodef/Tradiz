'use client';

import { FC, useEffect, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { IS_DEV, USE_DIGICARTE, WEB_URL } from '../utils/constants';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isAtLeast, useScreenSize } from '../utils/screenSizeConfig';
import Loading from '../loading';
import { Category } from './Category';
import { CloseButton } from './CloseButton';
import { NumPad } from './NumPad';
import { OrderBadge } from './OrderBadge';
import { Total } from './Total';
import { postCustomerDisplay } from '../utils/message';
import { CLOSE, postMessageToParent } from '../utils/message';
import {
    buildIdleDisplay,
    buildTransactionDisplay,
    isChangeDisplayHeld,
    releaseChangeDisplay,
} from '../utils/customerDisplay';

interface PendingOrder {
    orderId: number;
    shortNumOrder: string;
    tableId: number | null;
    createdAt: string;
}

export const MainContent: FC<{ showLightAdminNav?: boolean }> = ({ showLightAdminNav = false }) => {
    const { isStateReady, parameters, currencies, currencyIndex, modeFonctionnement } = useConfig();
    const { openPopup, closePopup, isPopupOpen } = usePopup();
    const {
        setOrderId,
        setOrderData,
        addProduct,
        clearTotal,
        shortNumOrder,
        setShortNumOrder,
        orderId,
        setContextTableId,
        contextTableId,
        checkAndPerformDayReset,
        products,
        total,
        selectedProduct,
    } = useData();
    const [showTransverseMode, setShowTransverseMode] = useState(false);
    const [showOrderWithTable, setShowOrderWithTable] = useState(false);

    // `products` is a ref used as a mutable store, so the count and the last entry are read here to
    // give the display effect a dependency that also changes for zero-priced products.
    const productCount = products.current.length;
    const currentProduct = selectedProduct ?? products.current.at(-1);
    const currency = currencies[currencyIndex];

    // Drive the customer-facing backscreen:
    // - App not ready: "Fermé"
    // - Products in the basket and no popup open: current product + total
    // - Popup open (payment): the payment flow owns the display via usePay
    // - Basket empty: shop name, unless change owed is still being shown
    useEffect(() => {
        if (!isStateReady) {
            releaseChangeDisplay();
            postCustomerDisplay(buildIdleDisplay(parameters.shop.name, true));
            return;
        }
        if (isPopupOpen) return;
        if (productCount > 0 && currency) {
            releaseChangeDisplay();
            postCustomerDisplay(buildTransactionDisplay(currentProduct, total, currency));
            return;
        }
        if (isChangeDisplayHeld()) return;
        postCustomerDisplay(buildIdleDisplay(parameters.shop.name, false));
    }, [isStateReady, isPopupOpen, parameters.shop.name, productCount, currentProduct, total, currency]);

    // Listen for ORDER_ID messages from parent (kitchen iframe)
    useEffect(() => {
        if (!USE_DIGICARTE) return;

        const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== WEB_URL) return;

            if (event.data && event.data.type === 'ORDER_ID') {
                const loadOrderById = async (targetOrderId: string) => {
                    // Load order data for partial payment
                    try {
                        const response = await fetch(`/api/sql/getOrderItemsForPayment?orderId=${targetOrderId}`);
                        if (response.ok) {
                            const data = await response.json();
                            setOrderData(data);
                        }
                    } catch (error) {
                        console.error('Failed to load order data:', error);
                    }

                    // Load order items as products (+ shortNumOrder)
                    try {
                        const res = await fetch(`/api/sql/getOrderItems?orderId=${targetOrderId}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.shortNumOrder) setShortNumOrder(data.shortNumOrder);
                            (data.products || []).forEach(addProduct);
                        }
                    } catch (error) {
                        console.error('Failed to load order items:', error);
                    }

                    // Set the order ID (after data is loaded to avoid race conditions)
                    setOrderId(targetOrderId);
                };

                const rawOrderId = event.data.orderId;
                const rawTableId = Number(event.data.tableId);
                const openMode = String(event.data.openMode ?? '');
                const hasTableContext = Number.isFinite(rawTableId) && rawTableId > 0;
                const hasTableIdField =
                    typeof event.data === 'object' &&
                    event.data !== null &&
                    Object.prototype.hasOwnProperty.call(event.data, 'tableId');
                const isSingleOrderOpen = openMode === 'single_order' && hasTableContext;
                setContextTableId(hasTableContext ? String(rawTableId) : '');

                // Always clear any existing transaction on caisse open
                clearTotal();
                setOrderData(null);

                const orderId = String(rawOrderId ?? '');

                // No order context — stop here (don't call API with undefined orderId)
                if (!orderId || orderId === '0' || orderId === 'undefined') {
                    const isTransverseOpen = hasTableIdField && !hasTableContext;
                    const isTableOpenWithoutOrder = hasTableIdField && hasTableContext;
                    setShowTransverseMode(isTransverseOpen);
                    setShowOrderWithTable(false);

                    if (isTransverseOpen || isTableOpenWithoutOrder) {
                        try {
                            const endpoint = isTableOpenWithoutOrder
                                ? `/api/sql/getPendingOrdersForCashier?tableId=${rawTableId}`
                                : '/api/sql/getPendingOrdersForCashier';
                            const response = await fetch(endpoint);
                            if (!response.ok) return;

                            const pendingOrders = (await response.json()) as PendingOrder[];
                            if (!pendingOrders.length) return;

                            if (pendingOrders.length === 1) {
                                await loadOrderById(String(pendingOrders[0].orderId));
                                return;
                            }

                            const options = pendingOrders.map((pending) => {
                                const number = pending.shortNumOrder
                                    ? `Commande #${pending.shortNumOrder}`
                                    : `Commande #${pending.orderId}`;
                                const table =
                                    pending.tableId && pending.tableId > 0 ? `Table ${pending.tableId}` : 'Sans table';
                                return `${number} - ${table}`;
                            });

                            openPopup(
                                isTableOpenWithoutOrder ? `Table ${rawTableId}` : 'Mode transverse',
                                options,
                                (index) => {
                                    if (index < 0) return;
                                    const selected = pendingOrders[index];
                                    if (!selected) return;
                                    closePopup(() => {
                                        void loadOrderById(String(selected.orderId));
                                    });
                                },
                                true
                            );
                        } catch (error) {
                            console.error('Failed to load pending orders:', error);
                        }
                    }

                    return;
                }

                setShowTransverseMode(false);
                setShowOrderWithTable(isSingleOrderOpen);
                await loadOrderById(orderId);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [setOrderId, setOrderData, setShortNumOrder, addProduct, clearTotal, setContextTableId, openPopup, closePopup]);

    const handleClick = () => {
        // Check if daily reset should happen (silently)
        checkAndPerformDayReset();

        // Request fullscreen if needed
        if (isStateReady && !isFullscreen() && !IS_DEV && !USE_DIGICARTE) requestFullscreen();
    };

    const { widthSize, heightSize } = useScreenSize();
    const catalogMode =
        (parameters.display?.catalogMode ?? false) && isAtLeast(widthSize, 'sm') && isAtLeast(heightSize, 'sm');

    if (!isStateReady) {
        return (
            <div className="z-10 flex flex-col justify-between">
                <Loading />
                <Category />
            </div>
        );
    }

    return (
        <div
            className={
                catalogMode
                    ? 'z-10 flex flex-col absolute inset-0 overflow-hidden'
                    : 'z-10 flex flex-col justify-between'
            }
            onClick={handleClick}
        >
            {/* Always-visible close button in top right corner */}
            <div className="fixed top-0 right-0 z-50">
                {USE_DIGICARTE && modeFonctionnement !== 'lite' && (
                    <CloseButton
                        onClose={() => postMessageToParent(CLOSE)}
                        className="pt-0 active:bg-light dark:active:bg-dark text-light dark:text-dark"
                        size="xl"
                    />
                )}
                {typeof window !== 'undefined' && window.electronAPI?.closeApp && (
                    <CloseButton
                        onClose={() => {
                            openPopup('Voulez-vous vraiment fermer Tradiz ?', ['Annuler', 'Fermer'], (index) => {
                                if (index === 1) {
                                    window.electronAPI?.closeApp();
                                } else {
                                    closePopup();
                                }
                            });
                        }}
                        className="pt-0 active:bg-light dark:active:bg-dark text-light dark:text-dark"
                        size="xl"
                    />
                )}
            </div>
            <OrderBadge
                orderId={orderId}
                shortNumOrder={shortNumOrder}
                contextTableId={contextTableId}
                showTransverseMode={showTransverseMode}
                showOrderWithTable={showOrderWithTable}
            />
            {catalogMode ? (
                <div className="flex-1 flex relative min-h-0">
                    <NumPad displayOnly={catalogMode} />
                    <Total showLightAdminNav={showLightAdminNav} compact={catalogMode} />
                </div>
            ) : (
                <>
                    <Total showLightAdminNav={showLightAdminNav} />
                    <NumPad />
                </>
            )}
            <Category catalogMode={catalogMode} />
        </div>
    );
};
