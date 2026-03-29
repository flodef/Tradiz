import { CashRegisterApp } from './components/CashRegisterApp';

type HomeProps = {
    params: Promise<{ shop: string }>;
};

export default async function Home({ params }: HomeProps) {
    const { shop } = await params;

    return <CashRegisterApp shop={shop} showLightAdminNav />;
}
