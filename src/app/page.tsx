'use client';

import { Total } from './components/Total';
import { NumPad } from './components/NumPad';
import { Category } from './components/Category';
import { DataProvider } from './contexts/DataProvider';

export default function Home() {
    const maxDecimals = 2;
    const maxValue = 999.99;
    const category = [
        ['Pain', 'Salon⋅Thé', 'Journal'],
        ['Pâtisserie', 'Epicerie', 'Autres'],
    ];

    return (
        <main className="absolute inset-0 bg-orange-100 text-amber-600 grid">
            <DataProvider>
                <Total />
                <NumPad maxDecimals={maxDecimals} maxValue={maxValue} />
                <Category category={category} />
            </DataProvider>
        </main>
    );
}
