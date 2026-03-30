import { ReactNode } from 'react';
import AdminConfigWrapper from '@/app/components/admin/AdminConfigWrapper';

export default function StatsLayout({ children }: { children: ReactNode }) {
    return <AdminConfigWrapper>{children}</AdminConfigWrapper>;
}
