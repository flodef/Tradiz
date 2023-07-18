import { Category } from './components/Category';
import { NumPad } from './components/NumPad';
import { Popup } from './components/Popup';
import { Total } from './components/Total';
import { ConfigProvider } from './contexts/ConfigProvider';
import { DataProvider } from './contexts/DataProvider';
import { PaymentProvider } from './contexts/SolanaProvider';
import { PopupProvider } from './contexts/PopupProvider';
import {} from './utils/currency';

export default function Home() {
    return (
        <main className="absolute inset-0 bg-orange-100 text-amber-600 grid select-none overflow-y-auto md:overflow-y-hidden">
            <ConfigProvider>
                <DataProvider>
                    <PopupProvider>
                        <PaymentProvider>
                            <div className="z-10 h-screen flex flex-col justify-between">
                                <Total />
                                <NumPad />
                                <Category />
                            </div>
                            <Popup />
                        </PaymentProvider>
                    </PopupProvider>
                </DataProvider>
            </ConfigProvider>
        </main>
    );
}
