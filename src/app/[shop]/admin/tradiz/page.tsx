import { CashRegisterApp } from '@/app/components/CashRegisterApp';

type PageProps = {
    params: Promise<{ shop: string }>;
};

export default async function ShopAdminTradizPage({ params }: PageProps) {
    const { shop } = await params;
    return <CashRegisterApp shop={shop} showLightAdminNav />;
}
