'use client';

import { ReactNode } from 'react';
import { ConfigProvider } from '@/app/contexts/ConfigProvider';
import { PopupProvider } from '@/app/contexts/PopupProvider';
import { Popup } from '../Popup';
import { VirtualKeyboardProvider } from './VirtualKeyboardProvider';
import { useConfig } from '@/app/hooks/useConfig';

function AdminVirtualKeyboardWrapper({ children }: { children: ReactNode }) {
    const { parameters } = useConfig();
    return (
        <VirtualKeyboardProvider enabled={parameters?.useVirtualKeyboard ?? false}>{children}</VirtualKeyboardProvider>
    );
}

export default function AdminConfigWrapper({ children }: { children: ReactNode }) {
    return (
        <ConfigProvider shop="">
            <PopupProvider>
                <AdminVirtualKeyboardWrapper>
                    {children}
                    <Popup variant="admin" />
                </AdminVirtualKeyboardWrapper>
            </PopupProvider>
        </ConfigProvider>
    );
}
