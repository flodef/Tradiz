'use client';

import { FC } from 'react';

interface OrderBadgeProps {
    orderId: string;
    shortNumOrder: string;
}

export const OrderBadge: FC<OrderBadgeProps> = ({ orderId, shortNumOrder }) => {
    if (!orderId || !shortNumOrder) return null;

    return (
        <span className="fixed top-3 left-4 hidden md:block text-2xl font-bold opacity-75 select-none pointer-events-none z-50">
            Commande #{shortNumOrder}
        </span>
    );
};
