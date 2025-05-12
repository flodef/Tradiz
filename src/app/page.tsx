import { MainContent } from './components/MainContent';
import { Popup } from './components/Popup';
import { ConfigProvider } from './contexts/ConfigProvider';
import { CryptoProvider } from './contexts/CryptoProvider';
import { DataProvider } from './contexts/DataProvider';
import { PopupProvider } from './contexts/PopupProvider';
import {} from './utils/extensions';

type HomeProps = {
    params: {};
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function Home({ params, searchParams }: HomeProps) {
    // In Next.js 15, we need to await searchParams before accessing its properties
    const awaitedParams = await searchParams;
    const shop = typeof awaitedParams.shop === 'string' ? awaitedParams.shop : '';

    return (
        <main
            className={'absolute inset-0 grid select-none overflow-y-auto md:overflow-y-hidden'}
            style={{ background: 'inherit' }}
        >
            <ConfigProvider shop={shop}>
                <DataProvider>
                    <PopupProvider>
                        <CryptoProvider>
                            <MainContent />
                            <Popup />
                        </CryptoProvider>
                    </PopupProvider>
                </DataProvider>
            </ConfigProvider>
        </main>
    );
}
