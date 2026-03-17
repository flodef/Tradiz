import { CashRegisterApp } from '@/app/components/CashRegisterApp';

type PageProps = {
    searchParams: Promise<{ shop?: string }>;
};

export default async function AdminTradizPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const shop = params.shop ?? process.env.DEFAULT_SHOP ?? process.env.NEXT_PUBLIC_DEFAULT_SHOP;

    if (!shop) {
        return (
            <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center p-6">
                <div className="rounded-xl border border-amber-300 bg-amber-100 p-4 text-amber-900">
                    Paramètre manquant: ajoutez ?shop=votre_identifiant pour ouvrir la caisse.
                </div>
            </main>
        );
    }

    return <CashRegisterApp shop={shop} showLightAdminNav />;
}
