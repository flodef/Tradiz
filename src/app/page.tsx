import { Category } from './components/Category';
import { NumPad } from './components/NumPad';
import { Popup } from './components/Popup';
import { Total } from './components/Total';
import { ConfigProvider } from './contexts/ConfigProvider';
import { CryptoProvider } from './contexts/CryptoProvider';
import { DataProvider } from './contexts/DataProvider';
import { PopupProvider } from './contexts/PopupProvider';
import {} from './utils/extensions';

export default function Home(shop: string) {
    return (
        <main
            className={'absolute inset-0 grid select-none overflow-y-auto md:overflow-y-hidden'}
            style={{ background: 'inherit' }}
        >
            <ConfigProvider shop={shop}>
                <DataProvider>
                    <PopupProvider>
                        <CryptoProvider>
                            <div className="z-10 flex flex-col justify-between">
                                <Total />
                                <NumPad />
                                <Category />
                            </div>
                            <Popup />
                        </CryptoProvider>
                    </PopupProvider>
                </DataProvider>
            </ConfigProvider>
        </main>
    );
}
