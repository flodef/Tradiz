'use client';

import { Category } from './components/Category';
import { NumPad } from './components/NumPad';
import { Popup } from './components/Popup';
import { Total } from './components/Total';
import { DataProvider } from './contexts/DataProvider';
import { PopupProvider } from './contexts/PopupProvider';

export const otherKeyword = 'Autres';

export const maxDecimals = 2;
export const maxValue = 999.99;
export const inventory = [
    {
        category: 'Boulange',
        rate: 5.5,
        products: [
            { label: 'Baguette', price: 1.2 },
            { label: 'Campagne', price: 3 },
        ],
    },
    {
        category: 'Pâtisserie',
        rate: 5.5,
        products: [
            { label: 'Croissant', price: 1.3 },
            { label: 'Chocolatine', price: 1.4 },
        ],
    },
    { category: 'Epicerie', rate: 5.5, products: [{ label: 'Farine', price: 5 }] },
    {
        category: 'Salon⋅Thé',
        rate: 10,
        products: [
            { label: 'Café court', price: 1.5 },
            { label: 'Café allongé', price: 2 },
            { label: 'Thé', price: 3 },
        ],
    },
    {
        category: 'Alcool',
        rate: 20,
        products: [
            { label: 'Cidre', price: 5 },
            { label: 'Bière', price: 2 },
        ],
    },
    {
        category: otherKeyword,
        rate: 0,
        products: [
            { label: 'Journal', price: 0 },
            { label: 'Cartes Postales', price: 0 },
            { label: 'Tableau', price: 0 },
            { label: 'Couture', price: 0 },
            { label: 'Livres (Patrick)', price: 0 },
            { label: 'Art (Eliot)', price: 0 },
            { label: 'Savons (Morgane)', price: 0 },
        ],
    },
];

export const paymentMethods = ['CB', 'Espèces', 'Chèque', 'Crypto'];

export default function Home() {
    return (
        <main className="absolute inset-0 bg-orange-100 text-amber-600 grid select-none overflow-y-auto">
            <DataProvider>
                <PopupProvider>
                    <div className="z-10 h-screen flex flex-col justify-between">
                        <Total />
                        <NumPad />
                        <Category />
                    </div>
                    <Popup />
                </PopupProvider>
            </DataProvider>
        </main>
    );
}
