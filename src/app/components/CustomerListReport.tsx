'use client';

import { FC } from 'react';
import { Customer } from '@/app/utils/interfaces';
import { DirectoryListReport } from './DirectoryListReport';
import { Shop } from '@/app/contexts/ConfigProvider';

interface CustomerListReportProps {
    customers: Customer[];
    shop: Shop;
    onClose: () => void;
}

export const CustomerListReport: FC<CustomerListReportProps> = ({ customers, shop, onClose }) => {
    const entries = customers.map((c) => ({
        id: c.id ?? 0,
        name: `${c.lastName?.trim() || ''} ${c.firstName?.trim() || ''}`.trim(),
        reference: c.reference || '',
    }));

    return <DirectoryListReport title="Liste des clients" entries={entries} shop={shop} onClose={onClose} />;
};
