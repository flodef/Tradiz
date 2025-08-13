import { getShopConfig } from '@/app/actions/config';
import AdminPanel from '@/app/components/admin/AdminPanel';

type PageProps = {
    params: Promise<{ shop: string }>;
};

export default async function AdminPage({ params }: PageProps) {
    const { shop } = await params;
    const config = await getShopConfig(shop);

    return <AdminPanel initialConfig={config} shopName={shop} />;
}
