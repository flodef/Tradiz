'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import TradizTopNav from './TradizTopNav';
import { CloseButton } from '@/app/components/CloseButton';

interface AdminPageLayoutProps {
    title: string;
    children: ReactNode;
    action?: ReactNode;
}

export default function AdminPageLayout({ title, children, action }: AdminPageLayoutProps) {
    const router = useRouter();
    return (
        <div className="min-h-screen bg-linear-to-tr from-main-from-light to-main-to-light dark:from-main-from-dark dark:to-main-to-dark text-writing-light dark:text-writing-dark">
            <div
                className="sticky top-0 z-40 flex items-center border-b border-black/10 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur px-2 py-1 min-h-[56px]"
                style={{ position: 'sticky' }}
            >
                <div className="shrink-0 z-10">
                    <TradizTopNav inline />
                </div>
                <h1 className="absolute inset-x-0 text-center text-2xl font-bold truncate px-16 pointer-events-none">
                    {title}
                </h1>
                <div className="ml-auto shrink-0 z-10">
                    {action ?? (
                        <CloseButton
                            onClose={() => router.push('/')}
                            size="xl"
                            className="cursor-pointer active:bg-transparent dark:active:bg-transparent"
                        />
                    )}
                </div>
            </div>
            <div className="container mx-auto p-4">{children}</div>
        </div>
    );
}
