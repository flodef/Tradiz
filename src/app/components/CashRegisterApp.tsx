'use client';

import TopNav from '@/app/components/admin/TopNav';
import { useUserRole } from '@/app/hooks/useUserRole';
import { useEffect } from 'react';
import { ConfigProvider } from '../contexts/ConfigProvider';
import { CryptoProvider } from '../contexts/CryptoProvider';
import { DataProvider } from '../contexts/DataProvider';
import { PopupProvider } from '../contexts/PopupProvider';
import {} from '../utils/extensions';
import { MainContent } from './MainContent';
import { OfflineBanner } from './OfflineBanner';
import { Popup } from './Popup';

// Component to conditionally render TopNav based on user role
function TopNavController({ className, showLightAdminNav }: { className?: string; showLightAdminNav?: boolean }) {
    const { isCashier } = useUserRole();
    // Only show TopNav if user has admin or cashier access (they have accessible admin pages)
    if (!showLightAdminNav || !isCashier) return null;
    return <TopNav className={className} />;
}

type CashRegisterAppProps = {
    shop: string;
    showLightAdminNav?: boolean;
};

export function CashRegisterApp({ shop, showLightAdminNav = false }: CashRegisterAppProps) {
    // Fix height issue when exiting fullscreen
    useEffect(() => {
        const handleFullscreenChange = () => {
            // Force layout recalculation by toggling a CSS property
            document.documentElement.style.height = '';
            setTimeout(() => {
                document.documentElement.style.height = '100%';
            }, 0);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    return (
        <main
            className="absolute inset-0 grid select-none overflow-y-auto md:overflow-y-hidden bg-linear-to-tr from-main-from-light to-main-to-light dark:from-main-from-dark dark:to-main-to-dark"
            style={{ backgroundColor: 'var(--main-from-light-color)' }}
        >
            <OfflineBanner />
            <ConfigProvider shop={shop}>
                <DataProvider>
                    <PopupProvider>
                        <CryptoProvider>
                            <TopNavController className="hidden md:flex" showLightAdminNav={showLightAdminNav} />
                            <MainContent showLightAdminNav={showLightAdminNav} />
                            <Popup />
                        </CryptoProvider>
                    </PopupProvider>
                </DataProvider>
            </ConfigProvider>
        </main>
    );
}
