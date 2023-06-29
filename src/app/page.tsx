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
    const otherKeyword = 'Autres';
    const category = [
        'Boulange',
        'Pâtisserie',
        'Epicerie',
        'Salon⋅Thé',
        'Journal',
        'Alcool',
        'Cartes Postales',
        'Tableau',
        'Couture',
        'Livres (Patrick)',
        'Art (Eliot)',
        'Savons (Morgane)',
    ];
    const taxes = [
        { category: 'Boulange', rate: 5.5 },
        { category: 'Pâtisserie', rate: 5.5 },
        { category: 'Epicerie', rate: 5.5 },
        { category: 'Salon⋅Thé', rate: 10 },
        { category: 'Journal', rate: 0 },
        { category: 'Alcool', rate: 20 },
    ];
    const paymentMethod = ['CB', 'Espèces', 'Chèque', 'Ticket Restaurant', 'Crypto'];

    return (
        <main className="absolute inset-0 bg-orange-100 text-amber-600 grid select-none">
            <DataProvider taxes={taxes}>
                <PopupProvider>
                    <div className="z-10 h-screen">
                        <Total maxDecimals={maxDecimals} />
                        <NumPad maxDecimals={maxDecimals} maxValue={maxValue} paymentMethod={paymentMethod} />
                        <Category categories={category} otherKeyword={otherKeyword} />
                    </div>
                    <Popup />
                </PopupProvider>
            </DataProvider>
        </main>
    );
}
