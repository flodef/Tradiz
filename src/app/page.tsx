'use client';

import { Category } from './components/Category';
import { NumPad } from './components/NumPad';
import { Popup } from './components/Popup';
import { Total } from './components/Total';
import { DataProvider } from './contexts/DataProvider';
import { PopupProvider } from './contexts/PopupProvider';

export default function Home() {
    const maxDecimals = 2;
    const maxValue = 999.99;
    const category = [
        ['Pain', 'Salon⋅Thé', 'Journal'],
        ['Pâtisserie', 'Epicerie', 'Autres'],
    ];
    const paymentMethod = ['CB', 'Espèces', 'Chèque', 'Ticket Restaurant', 'Crypto'];

    return (
        <main className="absolute inset-0 bg-orange-100 text-amber-600 grid select-none">
            <DataProvider>
                <PopupProvider>
                    <div className="z-10">
                        <Total maxDecimals={maxDecimals} />
                        <NumPad maxDecimals={maxDecimals} maxValue={maxValue} paymentMethod={paymentMethod} />
                        <Category category={category} />
                    </div>
                    <Popup />
                </PopupProvider>
            </DataProvider>
        </main>
    );
}
