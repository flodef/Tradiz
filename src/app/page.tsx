import { Category } from './components/Category';
import { NumPad } from './components/NumPad';
import { Popup } from './components/Popup';
import { Total } from './components/Total';
import { ConfigProvider } from './contexts/ConfigProvider';
import { DataProvider } from './contexts/DataProvider';
import { SolanaProvider } from './contexts/SolanaProvider';
import { PopupProvider } from './contexts/PopupProvider';
import {} from './utils/currency';

export default function Home() {
    return (
        <main
            className={
                'absolute inset-0 grid select-none overflow-y-auto md:overflow-y-hidden ' +
                'bg-gradient-to-tr from-low-light to-high-light text-writing-light ' +
                'dark:bg-gradient-to-tr dark:from-low-dark dark:to-high-dark dark:text-writing-dark'
            }
        >
            <ConfigProvider>
                <DataProvider>
                    <PopupProvider>
                        <SolanaProvider>
                            <div className="z-10 h-screen flex flex-col justify-between">
                                <Total />
                                <NumPad />
                                <Category />
                            </div>
                            <Popup />
                        </SolanaProvider>
                    </PopupProvider>
                </DataProvider>
            </ConfigProvider>
        </main>
    );
}
