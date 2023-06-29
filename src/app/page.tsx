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
    const categories = [
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
        { rate: 5.5, categories: ['Boulange', 'Pâtisserie', 'Epicerie'] },
        { rate: 10, categories: ['Salon⋅Thé'] },
        { rate: 20, categories: ['Alcool'] },
    ];
    const paymentMethods = ['CB', 'Espèces', 'Chèque', 'Crypto'];

    return (
        <main className="absolute inset-0 bg-orange-100 text-amber-600 grid select-none overflow-y-auto">
            <DataProvider>
                <PopupProvider>
                    <div className="z-10 h-screen flex flex-col justify-between">
                        <Total maxDecimals={maxDecimals} />
                        <NumPad
                            maxDecimals={maxDecimals}
                            maxValue={maxValue}
                            paymentMethods={paymentMethods}
                            taxes={taxes}
                        />
                        <Category categories={categories} otherKeyword={otherKeyword} />
                    </div>
                    <Popup />
                </PopupProvider>
            </DataProvider>
        </main>
    );
}
