'use client';

import { ReactNode } from 'react';
import { ConfigProvider } from '@/app/contexts/ConfigProvider';
import { PopupProvider } from '@/app/contexts/PopupProvider';
import { Popup } from '../Popup';

export default function AdminConfigWrapper({ children }: { children: ReactNode }) {
    return (
        <ConfigProvider shop="">
            <PopupProvider>
                {children}
                <Popup />
            </PopupProvider>
        </ConfigProvider>
    );
}
