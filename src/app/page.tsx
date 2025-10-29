import { MainContent } from './components/MainContent';
import { Popup } from './components/Popup';
import { ConfigProvider } from './contexts/ConfigProvider';
import { CryptoProvider } from './contexts/CryptoProvider';
import { DataProvider } from './contexts/DataProvider';
import { PopupProvider } from './contexts/PopupProvider';
import {} from './utils/extensions';

type HomeProps = {
    params: Promise<{ shop: string }>;
};

export default async function Home({ params }: HomeProps) {
    const { shop } = await params;

    return (
        <main
            className="absolute inset-0 grid select-none overflow-y-auto md:overflow-y-hidden"
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
