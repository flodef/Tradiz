'use client';

import { ReactNode } from 'react';
import { ConfigProvider } from '@/app/contexts/ConfigProvider';

export default function AdminConfigWrapper({ children }: { children: ReactNode }) {
    return <ConfigProvider shop="">{children}</ConfigProvider>;
}
