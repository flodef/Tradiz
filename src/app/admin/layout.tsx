import { ReactNode } from 'react';
import AdminConfigWrapper from '@/app/components/admin/AdminConfigWrapper';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return <AdminConfigWrapper>{children}</AdminConfigWrapper>;
}
