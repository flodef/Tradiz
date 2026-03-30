'use client';

import { useEffect } from 'react';
import { MainContent } from './MainContent';
import { OfflineBanner } from './OfflineBanner';
import { Popup } from './Popup';
import TradizTopNav from './admin/TradizTopNav';
import { ConfigProvider } from '../contexts/ConfigProvider';
import { CryptoProvider } from '../contexts/CryptoProvider';
import { DataProvider } from '../contexts/DataProvider';
import { PopupProvider } from '../contexts/PopupProvider';
import {} from '../utils/extensions';

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
                            {showLightAdminNav ? <TradizTopNav className="hidden md:flex" /> : null}
                            <MainContent showLightAdminNav={showLightAdminNav} />
                            <Popup />
                        </CryptoProvider>
                    </PopupProvider>
                </DataProvider>
            </ConfigProvider>
        </main>
    );
}
