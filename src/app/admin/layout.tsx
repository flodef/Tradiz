import AdminConfigWrapper from '@/app/components/admin/AdminConfigWrapper';
import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <AdminConfigWrapper>{children}</AdminConfigWrapper>
    );
}
