'use client';

import { FC } from 'react';
import { User } from '@/app/utils/interfaces';
import { DirectoryListReport } from './DirectoryListReport';
import { Shop } from '@/app/contexts/ConfigProvider';

interface EmployeeListReportProps {
    users: User[];
    shop: Shop;
    onClose: () => void;
}

export const EmployeeListReport: FC<EmployeeListReportProps> = ({ users, shop, onClose }) => {
    const entries = users.map((u) => ({
        id: u.id ?? 0,
        name: u.name?.trim() || '',
        reference: u.reference || '',
    }));

    return <DirectoryListReport title="Liste des employés" entries={entries} shop={shop} onClose={onClose} />;
};
