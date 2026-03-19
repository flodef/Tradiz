'use client';

import { FC } from 'react';

interface OrderBadgeProps {
    orderId: string;
    shortNumOrder: string;
    contextTableId: string;
    showTransverseMode: boolean;
}

export const OrderBadge: FC<OrderBadgeProps> = ({ orderId, shortNumOrder, contextTableId, showTransverseMode }) => {
    let label = '';

    if (contextTableId) {
        label = `Table ${contextTableId}`;
    } else if (showTransverseMode) {
        label = 'Mode transverse';
    } else if (orderId && shortNumOrder) {
        label = `Commande #${shortNumOrder}`;
    }

    if (!label) return null;

    return (
        <span className="fixed top-3 left-4 hidden md:block text-2xl font-bold opacity-75 select-none pointer-events-none z-50">
            {label}
        </span>
    );
};
