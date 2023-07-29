import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: process.env.NEXT_PUBLIC_SHOP_NAME ?? 'Fims POS',
    description: 'Caisse enregistreuse',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
            <body className={inter.className}>{children}</body>
        </html>
    );
}
