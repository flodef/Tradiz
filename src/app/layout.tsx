import { Inter } from 'next/font/google';
import './globals.css';
import { cls } from './utils/constants';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'Tradiz',
    description: 'Caisse enregistreuse merveilleuse',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
            <body
                className={cls(
                    inter.className,
                    'text-writing-light dark:text-writing-dark',
                    'bg-gradient-to-tr from-main-from-light to-main-to-light dark:from-main-from-dark dark:to-main-to-dark'
                )}
            >
                {children}
            </body>
        </html>
    );
}
